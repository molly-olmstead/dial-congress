var senateData;
var houseData;
var congressData;
var perfStart;

function getRegExpString(critter) {
  var title = '(Senator|Sen\\.|Congressman|Congresswoman)';

  if (critter.house === 'house') {
    title = '(Representative|Rep\\.|Congressman|Congresswoman)';
  }

  var optionalQuote = '(\'|")?';
  var wildCardMiddle = optionalQuote + '(\\w*)(\\.)?' + optionalQuote;
  var upToTwoWildCardMiddles = '\\s*' + wildCardMiddle + '\\s*' + wildCardMiddle + '\\s*';
  var firstLast = '\\b' + critter.firstName + '\\b' + upToTwoWildCardMiddles + '\\b' + critter.lastName + '\\b';
  var lastFirst = '\\b' + critter.lastName + ',\\s*' + critter.firstName + '\\b';
  var titleLast = '\\b' + title + '\\s*' + critter.lastName + '\\b';
  var nicknames = '';
  var regExpString = '';

  function getNicknameString (nickname, lastName) {
    return '|\\b' + nickname + '\\b' + upToTwoWildCardMiddles + '\\b' + lastName + '\\b|\\b' + lastName + ',\\s*' + nickname + '\\b';
  }

  if (critter.nicknames) {
    if (Array.isArray(critter.nicknames)) {
      for (var i = 0; i < critter.nicknames.length; i++) {
        nicknames += getNicknameString(critter.nicknames[i], critter.lastName);
      }
    } else if (typeof critter.nicknames === 'string') {
      nicknames += getNicknameString(critter.nicknames[i], critter.lastName);
    }
  }

  regExpString += title + '?' + '(' + firstLast + nicknames + ')|' + titleLast + '|' + lastFirst;

  return regExpString;
}

function getLastNamesRegExp() {
  var lastNamesRegExpArr = [];

  for (var i = 0; i < congressData.length; i++) {
    lastNamesRegExpArr.push('\\b' + congressData[i].lastName + '\\b');
  }

  return new RegExp(lastNamesRegExpArr.join('|'), 'ig');
}

function scan(node) {
  perfStart = performance.now();

  if (node.innerText && !node.classList.contains('dial-congress-scanned')) {
    node.classList.add('dial-congress-scanned');

    var lastNamesRegExp = getLastNamesRegExp();
    var lastNames = node.innerText.match(lastNamesRegExp);

    if (lastNames) {
      var foundLastNames = _.uniq(lastNames);
      var foundLastNamesRegExpArr = [];
      var foundLastNamesRegExp;
      var markContext;

      for (var i = 0; i < congressData.length; i++) {
        if (foundLastNames.indexOf(congressData[i].lastName) > -1) {
          var senatorRegEx = '(' + getRegExpString(congressData[i]) + ')';
          foundLastNamesRegExpArr.push(senatorRegEx);
        }
      }

      if (foundLastNamesRegExpArr.length) {
        foundLastNamesRegExp = new RegExp(foundLastNamesRegExpArr.join('|'), 'ig');
        markContext = new Mark(node);

        markContext.markRegExp(foundLastNamesRegExp, {
          element: 'span',
          className: 'dial-congress',
          done: function(x) {
            var perfEnd = performance.now();
            var perfTime = Math.round(perfEnd - perfStart) / 1000;
            console.log('Dial Congress scan of DOM complete: ' + perfTime + ' seconds');
            console.log('Congress critters found: ' + x);
          }
        });

        bindHoverEvents();
      }
    }
  }
}

function bindHoverEvents() {
  $marks = $('.dial-congress');

  $marks.each(function(i, mark) {
    var $mark = $(mark);

    if (!$mark.hasClass('dial-congress-mouseenter')) {
      $mark.addClass('dial-congress-mouseenter');
      $mark.on('mouseenter', matchSenatorToMark);
    }
  });
}

function matchSenatorToMark(e) {
  var $el = $(e.target);
  var text = $el.text();

  for(var i = 0; i < congressData.length; i++) {
    var regExp = new RegExp(getRegExpString(congressData[i]), 'ig');

    if (text.match(regExp)) {
      buildTooltip($el, congressData[i]);
      $el.off('mouseenter', matchSenatorToMark);
      break;
    }
  }
}

function buildTooltip($el, senator) {
  track({
    eventName: 'tooltip-built',
    congressman: senator.firstName + ' ' + senator.lastName,
    text: $el.text()
  });

  $el.attr('title', senator.party + '/' + senator.state + ': ' + senator.phone);

  $el.tooltipster({
    functionReady: function() {
      track({
        eventName: 'tooltip-hover',
        congressman: senator.firstName + ' ' + senator.lastName,
        text: $el.text()
      });
    },
    interactive: true,
    theme: ['tooltipster-noir', 'tooltipster-noir-customized']
  });

  $el.tooltipster('open');
}

function checkIfTooltipster(node) {
  return node.classList.contains('tooltipster-base') || node.classList.contains('tooltipster-ruler') || node.classList.contains('tooltipstered');
}

function watchForDOMChanges() {
  var observer = new MutationObserver(function(mutations) {
    mutations.forEach(function(mutation) {
      if (mutation.addedNodes.length) {
        // check nodes that have been added to the DOM
        mutation.addedNodes.forEach(function(node) {
          if (node.nodeType == 1) {
            // node is an Element
            // make sure it's not a tooltipster and that it has content
            if (!checkIfTooltipster(node) && !!node.innerText) {
              scan(node);
            }
          } else if (node.nodeType == 3 && node.parentNode) {
            // node is Text, send parentNode to scan()
            scan(node.parentNode);
          }
        })
      } else if (mutation.target && !!mutation.target.innerText) {
        if ($(mutation.target).is(':visible')) {
          // check nodes that have had their attributes or characterData changed
          var tooltipsterRemoved = false;

          // check if tooltipster has been removed
          for(var i = 0; i < mutation.removedNodes.length; i++) {
            if (checkIfTooltipster(mutation.removedNodes[i])) {
              tooltipsterRemoved = true;
              break;
            }
          }

          if (!tooltipsterRemoved && !checkIfTooltipster(mutation.target)) {
            scan(mutation.target);
          }
        }
      }
    });
  });

  var observerConfig = {
    attributes: true,
    characterData: true,
    childList: true,
    subtree: true
  };

  var targetNode = document.body;
  observer.observe(targetNode, observerConfig);
}

function track(data) {
  chrome.runtime.sendMessage(data, function(response) {
    // console.log('message received', response);
  });
}

$(document).ready(function() {
  $.when(
    $.get(chrome.extension.getURL('js/senate.json'), function(data) {
      senateData = JSON.parse(data);
      senateData.forEach(function(senator) {
        senator.house = 'senate';
      });
    }),

    $.get(chrome.extension.getURL('js/house.json'), function(data) {
      houseData = JSON.parse(data);
      houseData.forEach(function(rep) {
        rep.house = 'house';
      });
    })
  ).then(function() {
    congressData = _.union(senateData, houseData);
    perfStart = performance.now();
    scan(document.body);
    watchForDOMChanges();
  });
});
