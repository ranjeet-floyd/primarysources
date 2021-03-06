/**
 * freebase2wikidata.js
 *
 * Wikidata user script for the migration of Freebase facts into Wikidata.
 *
 * @author: Thomas Steiner (tomac@google.com)
 * @license: CC0 1.0 Universal (CC0 1.0)
 */

/* jshint
  bitwise:true,
  curly: true,
  indent: 2,
  immed: true,
  latedef: true,
  loopfunc: true,
  maxlen: 80,
  newcap: true,
  browser: true,
  noempty: true,
  nonbsp: true,
  nonew: true,
  quotmark: single,
  shadow: true,
  strict: true,
  trailing: true,
  undef: true,
  unused: true
*/

/* global
  console, mw, $, async, HTML_TEMPLATES
*/

$(document).ready(function() {
  'use strict';

  var DEBUG = JSON.parse(localStorage.getItem('f2w_debug')) || false;
  var FAKE_OR_RANDOM_DATA =
      JSON.parse(localStorage.getItem('f2w_fakeOrRandomData')) || false;

  var CACHE_EXPIRY = 24 * 60 * 60 * 1000;

  var LIST_OF_PROPERTIES_URL =
      'https://www.wikidata.org/wiki/Wikidata:List_of_properties/all';
  var WIKIDATA_ENTITY_DATA_URL =
      'https://www.wikidata.org/wiki/Special:EntityData/{{qid}}.json';
  var WIKIDATA_ENTITY_LABELS_URL = 'https://www.wikidata.org/w/api.php' +
      '?action=wbgetentities&languages={{languages}}&format=json' +
      '&props=labels&ids={{entities}}';
  var FREEBASE_ENTITY_DATA_URL =
      'https://tools.wmflabs.org/wikidata-primary-sources/entities/{{qid}}';
  var FREEBASE_STATEMENT_APPROVAL_URL =
      'https://tools.wmflabs.org/wikidata-primary-sources/statements/{{id}}' +
      '?state={{state}}&user={{user}}';
  var FREEBASE_DATASETS =
    'https://tools.wmflabs.org/wikidata-primary-sources/datasets/all';
  var FREEBASE_SOURCE_URL_BLACKLIST = 'https://www.wikidata.org/w/api.php' +
      '?action=parse&format=json&prop=text' +
      '&page=Wikidata:Primary_sources_tool/URL_blacklist';

  var WIKIDATA_API_COMMENT =
      'Added via [[Wikidata:Primary sources tool]]';

  var STATEMENT_STATES = {
    approved: 'approved',
    wrong: 'wrong',
    duplicate: 'duplicate',
    blacklisted: 'blacklisted',
    unapproved: 'unapproved'
  };
  var STATEMENT_FORMAT = 'v1';

  /* jshint ignore:start */
  /* jscs: disable */
  var HTML_TEMPLATES = {
    qualifierHtml:
        '<div class="wikibase-listview">' +
          '<div class="wikibase-snaklistview listview-item">' +
            '<div class="wikibase-snaklistview-listview">' +
              '<div class="wikibase-snakview listview-item">' +
                '<div class="wikibase-snakview-property-container">' +
                  '<div class="wikibase-snakview-property" dir="auto">' +
                    '<a href="/wiki/Property:{{qualifier-property}}" title="Property:{{qualifier-property}}">{{qualifier-property-label}}</a>' +
                  '</div>' +
                '</div>' +
                '<div class="wikibase-snakview-value-container" dir="auto">' +
                  '<div class="wikibase-snakview-typeselector"></div>' +
                  '<div class="wikibase-snakview-value wikibase-snakview-variation-valuesnak" style="height: auto; width: 100%;">' +
                    '<div class="valueview valueview-instaticmode" aria-disabled="false">' +
                      '{{qualifier-object}}' +
                    '</div>' +
                  '</div>' +
                '</div>' +
              '</div>' +
              '<!-- wikibase-listview -->' +
            '</div>' +
          '</div>' +
        '</div>',
    sourceHtml:
        '<div class="wikibase-referenceview listview-item wikibase-toolbar-item new-source">' + // Remove wikibase-reference-d6e3ab4045fb3f3feea77895bc6b27e663fc878a wikibase-referenceview-d6e3ab4045fb3f3feea77895bc6b27e663fc878a
          '<div class="wikibase-referenceview-heading new-source">' +
            '<div class="wikibase-edittoolbar-container wikibase-toolbar-container">' +
              '<span class="wikibase-toolbar wikibase-toolbar-item wikibase-toolbar-container">' +
                '[' +
                '<span class="wikibase-toolbarbutton wikibase-toolbar-item wikibase-toolbar-button wikibase-toolbar-button-edit">' +
                  '<a class="f2w-button f2w-source f2w-approve" href="#" data-statement-id="{{statement-id}}" data-property="{{data-property}}" data-object="{{data-object}}" data-source-property="{{data-source-property}}" data-source-object="{{data-source-object}}" data-qualifiers="{{data-qualifiers}}">approve</a>' +
                '</span>' +
                ']' +
              '</span>' +
              /* TODO: Broken by the last changes.
              '<span class="wikibase-toolbar wikibase-toolbar-item wikibase-toolbar-container">' +
                '[' +
                '<span class="wikibase-toolbarbutton wikibase-toolbar-item wikibase-toolbar-button wikibase-toolbar-button-edit">' +
                  '<a class="f2w-button f2w-source f2w-edit" href="#" data-statement-id="{{statement-id}}" data-property="{{data-property}}" data-object="{{data-object}}" data-source-property="{{data-source-property}}" data-source-object="{{data-source-object}}" data-qualifiers="{{data-qualifiers}}">edit</a>' +
                '</span>' +
                ']' +
              '</span>' +*/
              '<span class="wikibase-toolbar wikibase-toolbar-item wikibase-toolbar-container">' +
                '[' +
                '<span class="wikibase-toolbarbutton wikibase-toolbar-item wikibase-toolbar-button wikibase-toolbar-button-edit">' +
                  '<a class="f2w-button f2w-source f2w-reject" href="#" data-statement-id="{{statement-id}}" data-property="{{data-property}}" data-object="{{data-object}}" data-source-property="{{data-source-property}}" data-source-object="{{data-source-object}}" data-qualifiers="{{data-qualifiers}}">reject</a>' +
                '</span>' +
                '] source' +
              '</span>' +
            '</div>' +
          '</div>' +
          '<div class="wikibase-referenceview-listview">' +
            '<div class="wikibase-snaklistview listview-item">' +
              '<div class="wikibase-snaklistview-listview">' +
                '<div class="wikibase-snakview listview-item">' +
                  '<div class="wikibase-snakview-property-container">' +
                    '<div class="wikibase-snakview-property" dir="auto">' +
                      '<a href="/wiki/Property:{{source-property}}" title="Property:{{source-property}}">{{source-property-label}}</a>' +
                    '</div>' +
                  '</div>' +
                  '<div class="wikibase-snakview-value-container" dir="auto">' +
                    '<div class="wikibase-snakview-typeselector"></div>' +
                    '<div class="wikibase-snakview-value wikibase-snakview-variation-valuesnak" style="height: auto;">' +
                      '<div class="valueview valueview-instaticmode" aria-disabled="false">' +
                        '{{source-object}}' +
                      '</div>' +
                    '</div>' +
                  '</div>' +
                '</div>' +
                '<!-- wikibase-listview -->' +
              '</div>' +
            '</div>' +
            '<!-- [0,*] wikibase-snaklistview -->' +
          '</div>' +
        '</div>',
    statementViewHtml:
        '<div class="wikibase-statementview listview-item wikibase-toolbar-item new-object">' + // Removed class wikibase-statement-q31$8F3B300A-621A-4882-B4EE-65CE7C21E692
          '<div class="wikibase-statementview-rankselector">' +
            '<div class="wikibase-rankselector ui-state-disabled">' +
              '<span class="ui-icon ui-icon-rankselector wikibase-rankselector-normal" title="Normal rank"></span>' +
            '</div>' +
          '</div>' +
          '<div class="wikibase-statementview-mainsnak-container">' +
            '<div class="wikibase-statementview-mainsnak" dir="auto">' +
              '<!-- wikibase-snakview -->' +
              '<div class="wikibase-snakview">' +
                '<div class="wikibase-snakview-property-container">' +
                  '<div class="wikibase-snakview-property" dir="auto">' +
                    '<a href="/wiki/Property:{{property}}" title="Property:{{property}}">{{property-label}}</a>' +
                  '</div>' +
                '</div>' +
                '<div class="wikibase-snakview-value-container" dir="auto">' +
                  '<div class="wikibase-snakview-typeselector"></div>' +
                  '<div class="wikibase-snakview-value wikibase-snakview-variation-valuesnak" style="height: auto;">' +
                    '<div class="valueview valueview-instaticmode" aria-disabled="false">{{object}}</div>' +
                  '</div>' +
                '</div>' +
              '</div>' +
            '</div>' +
            '<div class="wikibase-statementview-qualifiers">' +
              '{{qualifiers}}' +
              '<!-- wikibase-listview -->' +
            '</div>' +
          '</div>' +
          '<!-- wikibase-toolbar -->' +
          '<span class="wikibase-toolbar-container wikibase-edittoolbar-container">' +
            '<span class="wikibase-toolbar-item wikibase-toolbar wikibase-toolbar-container">' +
              '[' +
              '<span class="wikibase-toolbarbutton wikibase-toolbar-item wikibase-toolbar-button wikibase-toolbar-button-edit">' +
                '<a class="f2w-button f2w-property f2w-approve" href="#" data-statement-id="{{statement-id}}" data-property="{{data-property}}" data-object="{{data-object}}" data-qualifiers="{{data-qualifiers}}">approve</a>' +
              '</span>' +
              ']' +
            '</span>' +
            '<span class="wikibase-toolbar-item wikibase-toolbar wikibase-toolbar-container">' +
              '[' +
              '<span class="wikibase-toolbarbutton wikibase-toolbar-item wikibase-toolbar-button wikibase-toolbar-button-edit">' +
                '<a class="f2w-button f2w-property f2w-reject" href="#" data-statement-id="{{statement-id}}" data-property="{{data-property}}" data-object="{{data-object}}" data-qualifiers="{{data-qualifiers}}">reject</a>' +
              '</span>' +
              '] property' +
            '</span>' +
          '</span>' +
          '<div class="wikibase-statementview-references-container">' +
            '<div class="wikibase-statementview-references-heading">' +
              '<a class="ui-toggler ui-toggler-toggle ui-state-default">' + // Removed ui-toggler-toggle-collapsed
                '<span class="ui-toggler-icon ui-icon ui-icon-triangle-1-s ui-toggler-icon3dtrans"></span>' +
                '<span class="ui-toggler-label">{{references}}</span>' +
              '</a>' +
            '</div>' +
            '<div class="wikibase-statementview-references wikibase-toolbar-item">' + // Removed style="display: none;"
              '<!-- wikibase-listview -->' +
              '<div class="wikibase-listview">' +
                '{{sources}}' +
              '</div>' +
              '<div class="wikibase-addtoolbar-container wikibase-toolbar-container">' +
                '<!-- [' +
                '<span class="wikibase-toolbarbutton wikibase-toolbar-item wikibase-toolbar-button wikibase-toolbar-button-add">' +
                  '<a href="#">add reference</a>' +
                '</span>' +
                '] -->' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>',
    mainHtml:
        '<div class="wikibase-statementgroupview listview-item" id="{{property}}">' +
          '<div class="wikibase-statementgroupview-property new-property">' +
            '<div class="wikibase-statementgroupview-property-label" dir="auto">' +
              '<a title="Property:{{property}}" href="/wiki/Property:{{property}}">{{property-label}}</a>' +
            '</div>' +
          '</div>' +
          '<!-- wikibase-statementlistview -->' +
          '<div class="wikibase-statementlistview wikibase-toolbar-item">' +
            '<div class="wikibase-statementlistview-listview">' +
              '<!-- [0,*] wikibase-statementview -->' +
              '{{statement-views}}' +
            '</div>' +
            '<!-- [0,1] wikibase-toolbar -->' +
            '<span class="wikibase-toolbar-container"></span>' +
            '<span class="wikibase-toolbar-wrapper">' +
              '<div class="wikibase-addtoolbar-container wikibase-toolbar-container">' +
                '<!-- [' +
                '<span class="wikibase-toolbarbutton wikibase-toolbar-item wikibase-toolbar-button wikibase-toolbar-button-add">' +
                  '<a href="#">add</a>' +
                '</span>' +
                '] -->' +
              '</div>' +
            '</span>' +
          '</div>' +
        '</div>'
  };
  /* jscs: enable */
  /* jshint ignore:end */

  var debug = {
    log: function(message) {
      if (DEBUG) {
        console.log('F2W: ' + message);
      }
    }
  };

  var qid = null;
  function getQid() {
    var qidRegEx = /^\/wiki\/(Q\d+)$/;
    var path = document.location.pathname;
    qid = qidRegEx.test(path) ? path.replace(qidRegEx, '$1') : false;
    return qid;
  }

  var dataset = mw.cookie.get('ps-dataset', null, '');

  (function init() {

    // Add random Primary Sources item button
    (function createRandomFreebaseItemLink() {
      var datasetLabel = (dataset === '') ? 'Primary Sources' : dataset;
      var portletLink = $(mw.util.addPortletLink(
        'p-navigation',
        '#',
        'Random ' + datasetLabel + ' item',
        'n-random-ps',
        'Load a new random ' + datasetLabel + ' item',
        '',
        '#n-help'
      ));
      portletLink.children().click(function(e) {
        e.preventDefault();
        $.ajax({
          url: FREEBASE_ENTITY_DATA_URL.replace(/\{\{qid\}\}/, 'any') + '?dataset=' + dataset
        }).done(function(data) {
          var newQid = data[0].statement.split(/\t/)[0];
          document.location.href = 'https://www.wikidata.org/wiki/' + newQid;
        }).fail(function() {
          return reportError('Could not obtain random Primary Sources item');
        });
      });

      mw.loader.using(['jquery.tipsy', 'oojs-ui'], function() {
        var configButton = $('<span>')
          .attr({
            id: 'ps-config-button',
            title: 'Primary Sources options'
          })
          .tipsy()
          .appendTo(portletLink);
        configDialog(configButton);
      });
    })();

    // Handle clicks on approve/edit/reject buttons
    (function addClickHandlers() {

      var isUrl = function(url) {
        try {
          url = new URL(url.toString().replace(/^["']/, '').replace(/["']$/, ''));
          if ((url.protocol.indexOf('http' === 0)) && (url.host)) {
            return true;
          }
        } catch (e) {
          return false;
        }
        return false;
      };

      var contentDiv = document.getElementById('content');
      contentDiv.addEventListener('click', function(event) {
        var classList = event.target.classList;
        if (!classList.contains('f2w-button')) {
          return;
        }
        event.preventDefault();
        event.target.innerHTML = '<img src="https://upload.wikimedia.org/' +
            'wikipedia/commons/f/f8/Ajax-loader%282%29.gif" class="ajax"/>';
        var statement = event.target.dataset;
        var id = statement.statementId;
        if (classList.contains('f2w-property')) {
          if (classList.contains('f2w-approve')) {
            // Approve property
            var predicate = statement.property;
            var object = statement.object;
            var qualifiers = JSON.parse(statement.qualifiers);
            createClaim(predicate, object, qualifiers)
              .fail(function(error) {
                return reportError(error);
              }).done(function(data) {
                setStatementState(id, STATEMENT_STATES.approved, function() {
                  debug.log('Approved property statement ' + id);
                  if (data.pageinfo && data.pageinfo.lastrevid) {
                    document.location.hash = 'revision=' +
                        data.pageinfo.lastrevid;
                  }
                  return document.location.reload();
                });
              });
          } else if (classList.contains('f2w-reject')) {
            // Reject property
            setStatementState(id, STATEMENT_STATES.wrong, function() {
              debug.log('Disapproved property statement ' + id);
              return document.location.reload();
            });
          }
        } else if (classList.contains('f2w-source')) {
          if (classList.contains('f2w-approve')) {
            // Approve source
            var predicate = statement.property;
            var object = statement.object;
            var sourceProperty = statement.sourceProperty;
            var sourceObject = statement.sourceObject;
            var qualifiers = JSON.parse(statement.qualifiers);
            getClaims(predicate, function(err, claims) {
              var objectExists = false;
              for (var i = 0, lenI = claims.length; i < lenI; i++) {
                var claim = claims[i];
                if (
                    claim.mainsnak.snaktype === 'value' &&
                    jsonToTsvValue(claim.mainsnak.datavalue) === object
                ) {
                  objectExists = true;
                  break;
                }
              }
              if (objectExists) {
                createReference(predicate, object, sourceProperty,
                    sourceObject, function(error, data) {
                  if (error) {
                    return reportError(error);
                  }
                  setStatementState(id, STATEMENT_STATES.approved,
                      function() {
                    debug.log('Approved source statement ' + id);
                    if (data.pageinfo && data.pageinfo.lastrevid) {
                      document.location.hash = 'revision=' +
                          data.pageinfo.lastrevid;
                    }
                    return document.location.reload();
                  });
                });
              } else {
                var qualifiers = JSON.parse(statement.qualifiers);
                createClaimWithReference(predicate, object, qualifiers,
                  sourceProperty, sourceObject)
                  .fail(function(error) {
                    return reportError(error);
                  })
                  .done(function(data) {
                    setStatementState(id, STATEMENT_STATES.approved,
                    function() {
                      debug.log('Approved source statement ' + id);
                      if (data.pageinfo && data.pageinfo.lastrevid) {
                        document.location.hash = 'revision=' +
                            data.pageinfo.lastrevid;
                      }
                      return document.location.reload();
                    });
                  });
              }
            });
          } else if (classList.contains('f2w-reject')) {
            // Reject source
            setStatementState(id, STATEMENT_STATES.wrong, function() {
              debug.log('Disapproved source statement ' + id);
              return document.location.reload();
            });
          } else if (classList.contains('f2w-edit')) {
            var a = document.getElementById('f2w-' + id);

            var onClick = function(e) {
              if (isUrl(e.target.textContent)) {
                a.style.textDecoration = 'none';
                a.href = e.target.textContent;
              } else {
                a.style.textDecoration = 'line-through';
              }
            };
            a.addEventListener('input', onClick);

            a.addEventListener('blur', function() {
              a.removeEventListener(onClick);
              a.onClick = function() { return true; };
              a.contentEditable = false;
              event.target.textContent = 'edit';
              var buttons = event.target.parentNode.parentNode
                  .querySelectorAll('a');
              [].forEach.call(buttons, function(button) {
                button.dataset.sourceObject = a.href;
              });
            });

            a.contentEditable = true;
          }
        }
      });
    })();

    qid = getQid();
    if (!qid) {
      return debug.log('Not on an item page');
    }
    debug.log('On item page ' + qid);

    async.parallel({
      propertyNames: getPropertyNames,
      blacklistedSourceUrls: getBlacklistedSourceUrls,
      wikidataEntityData: getWikidataEntityData.bind(null, qid),
      freebaseEntityData: getFreebaseEntityData.bind(null, qid),
    }, function(err, results) {
      if (err) {
        reportError(err);
      }
      // See https://www.mediawiki.org/wiki/Wikibase/Notes/JSON
      var wikidataEntityData = results.wikidataEntityData;
      var wikidataClaims = wikidataEntityData.claims || {};

      var freebaseEntityData = results.freebaseEntityData;
      var blacklistedSourceUrls = results.blacklistedSourceUrls;
      var freebaseClaims = parseFreebaseClaims(freebaseEntityData,
          blacklistedSourceUrls);

      matchClaims(wikidataClaims, freebaseClaims);
    });
  })();

  function reportError(error) {
    var errorMessage = document.createElement('div');
    errorMessage.classList.add('alert-box');
    errorMessage.classList.add('error');
    errorMessage.innerHTML = '<span>error: </span> ' + error +
        ' <button onclick="javascript:this.parentNode.remove();">Dismiss' +
         '</button>';
    document.body.appendChild(errorMessage);
  }

  function configDialog(button) {
    function ConfigDialog(config) {
      ConfigDialog.super.call(this, config);
    }
    OO.inheritClass(ConfigDialog, OO.ui.ProcessDialog);
    ConfigDialog.static.title = 'Primary Sources configuration';
    ConfigDialog.static.actions = [
      {action: 'save', label: 'Save', flags: ['primary', 'constructive']},
      {label: 'Cancel', flags: 'safe'}
    ];

    ConfigDialog.prototype.initialize = function() {
      ConfigDialog.super.prototype.initialize.apply(this, arguments);

      this.dataset = new OO.ui.ButtonSelectWidget({
        items: [new OO.ui.ButtonOptionWidget({
          data: '',
          label: 'All sources'
        })]
      });

      var dialog = this;
      getPossibleDatasets(function(datasets) {
        for (var datasetId in datasets) {
          dialog.dataset.addItems([new OO.ui.ButtonOptionWidget({
            data: datasetId,
            label: datasetId,
          })]);
        }
      });

      this.dataset.selectItemByData(dataset);

      var fieldset = new OO.ui.FieldsetLayout({
        label: 'Dataset to use'
      });
      fieldset.addItems([this.dataset]);

      this.panel = new OO.ui.PanelLayout({
        padded: true,
        expanded: false
      });
      this.panel.$element.append(fieldset.$element);
      this.$body.append(this.panel.$element);
    };

    ConfigDialog.prototype.getActionProcess = function(action) {
      if (action === 'save') {
        mw.cookie.set('ps-dataset', this.dataset.getSelectedItem().getData());
        return new OO.ui.Process(function() {
          location.reload();
        });
      }

      return ConfigDialog.super.prototype.getActionProcess.call(this, action);
    };

    ConfigDialog.prototype.getBodyHeight = function() {
      return this.panel.$element.outerHeight(true);
    };

    var windowManager = new OO.ui.WindowManager();
    $('body').append(windowManager.$element);

    var configDialog = new ConfigDialog();
    windowManager.addWindows([configDialog]);

    button.click(function() {
      windowManager.openWindow(configDialog);
    });
  }

  function getPossibleDatasets(callback) {
    var now = Date.now();
    if (localStorage.getItem('f2w_dataset')) {
      var blacklist = JSON.parse(localStorage.getItem('f2w_dataset'));
      if (!blacklist.timestamp) {
        blacklist.timestamp = 0;
      }
      if (now - blacklist.timestamp < CACHE_EXPIRY) {
        return callback(blacklist.data);
      }
    }
    $.ajax({
      url: FREEBASE_DATASETS
    }).done(function(data) {
      localStorage.setItem('f2w_dataset', JSON.stringify({
        timestamp: now,
        data: data
      }));
      return callback(data);
    }).fail(function() {
      debug.log('Could not obtain datasets');
    });
  }

  function parseFreebaseClaims(freebaseEntityData, blacklistedSourceUrls) {

    var blacklistedSourceUrlsLen = blacklistedSourceUrls.length;
    var isBlacklisted = function(url) {
      url = url.toString();
      for (var i = 0; i < blacklistedSourceUrlsLen; i++) {
        try {
          if ((new URL(url)).host.indexOf(blacklistedSourceUrls[i]) !== -1) {
            return true;
          }
        } catch (e) {
          continue;
        }
      }
      return false;
    };

    var freebaseClaims = {};
    /* jshint ignore:start */
    /* jscs: disable */
    if (DEBUG) {
      if (qid === 'Q4115189') {
        // The sandbox item can be written to
        document.getElementById('content').style.backgroundColor = 'lime';
      }
    }
    if (FAKE_OR_RANDOM_DATA) {
      freebaseEntityData.push({
        statement: qid + '\tP31\tQ1\tP580\t+00000001840-01-01T00:00:00Z/09\tS143\tQ48183',
        state: STATEMENT_STATES.unapproved,
        id: 0,
        format: STATEMENT_FORMAT
      });
      freebaseEntityData.push({
        statement: qid + '\tP108\tQ95\tS854\t"http://research.google.com/pubs/vrandecic.html"',
        state: STATEMENT_STATES.unapproved,
        id: 0,
        format: STATEMENT_FORMAT
      });
      freebaseEntityData.push({
        statement: qid + '\tP108\tQ8288\tP582\t+00000002013-09-30T00:00:00Z/10\tS854\t"http://simia.net/wiki/Denny"\tS813\t+00000002015-02-14T00:00:00Z/11',
        state: STATEMENT_STATES.unapproved,
        id: 0,
        format: STATEMENT_FORMAT
      });
      freebaseEntityData.push({
        statement: qid + '\tP1451\ten:"foo bar"\tP582\t+00000002013-09-30T00:00:00Z/10\tS854\t"http://www.ebay.com/itm/GNC-Mens-Saw-Palmetto-Formula-60-Tablets/301466378726?pt=LH_DefaultDomain_0&hash=item4630cbe1e6"',
        state: STATEMENT_STATES.unapproved,
        id: 0,
        format: STATEMENT_FORMAT
      });
      freebaseEntityData.push({
        statement: qid + '\tP108\tQ8288\tP582\t+00000002013-09-30T00:00:00Z/10\tS854\t"https://lists.wikimedia.org/pipermail/wikidata-l/2013-July/002518.html"',
        state: STATEMENT_STATES.unapproved,
        id: 0,
        format: STATEMENT_FORMAT
      });
      freebaseEntityData.push({
        statement: qid + '\tP1082\t-1234',
        state: STATEMENT_STATES.unapproved,
        id: 0,
        format: STATEMENT_FORMAT
      });
      freebaseEntityData.push({
        statement: qid + '\tP625\t@-12.12334556/23.1234',
        state: STATEMENT_STATES.unapproved,
        id: 0,
        format: STATEMENT_FORMAT
      });
      freebaseEntityData.push({
        statement: qid + '\tP569\t+00000001840-01-01T00:00:00Z/11\tS854\t"https://lists.wikimedia.org/pipermail/wikidata-l/2013-July/002518.html"',
        state: STATEMENT_STATES.unapproved,
        id: 0,
        format: STATEMENT_FORMAT
      });
    }
    /* jscs: enable */
    /* jshint ignore:end */
    // Unify statements, as some statements may appear more than once
    var statementUnique = function(haystack, needle) {
      for (var i = 0, lenI = haystack.length; i < lenI; i++) {
        if (haystack[i].statement === needle) {
          return i;
        }
      }
      return -1;
    };
    freebaseEntityData.filter(function(freebaseEntity, index, self) {
      return statementUnique(self, freebaseEntity.statement) === index;
    })
    // Only show v1 unapproved statements
    .filter(function(freebaseEntity) {
      return freebaseEntity.format === STATEMENT_FORMAT &&
          freebaseEntity.state === STATEMENT_STATES.unapproved;
    })
    .forEach(function(freebaseEntity) {
      var statement = freebaseEntity.statement;
      var id = freebaseEntity.id;
      var line = statement.split(/\t/);
      var predicate = line[1];
      var object = line[2];
      var qualifiers = [];
      var sources = [];
      // If there are qualifiers and/or sources
      var lineLength = line.length;
      if (lineLength > 3) {
        var qualifiersAndOrSources = line.slice(3).join('\t');
        // Qualifier regular expression
        var hasQualifiers = /P\d+/.exec(qualifiersAndOrSources);
        // Source regular expression
        var hasSources = /S\d+/.exec(qualifiersAndOrSources);
        var qualifiersString = '';
        var sourcesString = '';
        if (hasQualifiers) {
          qualifiersString = hasSources ?
              qualifiersAndOrSources.substring(0, hasSources.index) :
              qualifiersAndOrSources;
          qualifiersString = qualifiersString.replace(/^\t/, '')
              .replace(/\t$/, '').split(/\t/);
          if ((qualifiersString.length % 2) !== 0) {
            return debug.log('Error: invalid qualifiers: ' +
                qualifiersString);
          }
          var qualifiersStringLen = qualifiersString.length;
          for (var i = 0; i < qualifiersStringLen; i = i + 2) {
            qualifiers.push({
              qualifierProperty: qualifiersString[i],
              qualifierObject: qualifiersString[i + 1],
              qualifierId: id,
              key: qualifiersString[i] + '\t' + qualifiersString[i + 1]
            });
          }
        }
        if (hasSources) {
          sourcesString = hasQualifiers ?
              qualifiersAndOrSources.substring(hasSources.index) :
              qualifiersAndOrSources;
          sourcesString = sourcesString.replace(/^\t/, '')
              .replace(/\t$/, '').split(/\t/);
          if ((sourcesString.length % 2) !== 0) {
            return debug.log('Error: invalid sources: ' + sourcesString);
          }
          var sourcesStringLen = sourcesString.length;
          for (var i = 0; i < sourcesStringLen; i = i + 2) {
            sources.push({
              sourceProperty: sourcesString[i].replace(/^S/, 'P'),
              sourceObject: sourcesString[i + 1],
              sourceType: (tsvValueToJson(sourcesString[i + 1])).type,
              sourceId: id,
              key: sourcesString[i] + '\t' + sourcesString[i + 1]
            });
          }
          // Filter out blacklisted source URLs
          sources = sources.filter(function(source) {
            if (source.sourceType === 'url') {
              var url = source.sourceObject.replace(/^"/, '').replace(/"$/, '');
              var blacklisted = isBlacklisted(url);
              if (blacklisted) {
                debug.log('Encountered blacklisted source url ' + url);
                (function(currentId, currentUrl) {
                  setStatementState(currentId, STATEMENT_STATES.blacklisted,
                      function() {
                    debug.log('Automatically blacklisted statement ' +
                        currentId + ' with blacklisted source url ' +
                        currentUrl);
                  });
                })(source.sourceId, url);
              }
              // Return the opposite, i.e., the whitelisted URLs
              return !blacklisted;
            }
            return true;
          });
        }
      }
      freebaseClaims[predicate] = freebaseClaims[predicate] || {};
      if (!freebaseClaims[predicate][object]) {
        freebaseClaims[predicate][object] = {
          id: id,
          qualifiers: [],
          sources: []
        };
      }

      freebaseClaims[predicate][object].qualifiers =
        arrayOfObjectWithKeyUnique(
          freebaseClaims[predicate][object].qualifiers.concat(qualifiers)
        );
      freebaseClaims[predicate][object].sources =
        arrayOfObjectWithKeyUnique(
          freebaseClaims[predicate][object].sources.concat(sources)
        );
    });
    return freebaseClaims;
  }

  function arrayOfObjectWithKeyUnique(array) {
    var table = {};
    for (var i in array) {
      table[array[i].key] = array[i];
    }

    var array = [];
    for (var i in table) {
      array.push(table[i]);
    }
    return array;
  }

  function computeCoordinatesPrecision(latitude, longitude) {
    return Math.min(
        Math.pow(10, -numberOfDecimalDigits(latitude)),
        Math.pow(10, -numberOfDecimalDigits(longitude))
    );
  }

  function numberOfDecimalDigits(number) {
    var parts = number.split('.');
    if (parts.length < 2) {
      return 0;
    }
    return parts[1].length;
  }

  function tsvValueToJson(value) {
    // From https://www.wikidata.org/wiki/Special:ListDatatypes and
    // https://de.wikipedia.org/wiki/Wikipedia:Wikidata/Wikidata_Spielwiese
    // https://www.wikidata.org/wiki/Special:EntityData/Q90.json

    // Q1
    var itemRegEx = /^Q\d+$/;

    // P1
    var propertyRegEx = /^P\d+$/;

    // @43.3111/-16.6655
    var coordinatesRegEx = /^@([+\-]?\d+(?:.\d+)?)\/([+\-]?\d+(?:.\d+))?$/;

    // fr:"Les Misérables"
    var languageStringRegEx = /^(\w+):"([^"\\]*(?:\\.[^"\\]*)*)"$/;

    // +00000002013-01-01T00:00:00Z/10
    /* jshint maxlen: false */
    var timeRegEx = /^[+-]\d{11}-[01]\d-[0-3]\dT[0-2]\d(?::[0-5]\d){2}(?:[.,]\d+)?([+-][0-2]\d:[0-5]\d|Z)(?:\/\d[0-4])?$/;
    /* jshint maxlen: 80 */

    // +/-1234.4567
    var quantityRegEx = /^[+-]\d+(\.\d+)?$/;

    // "http://research.google.com/pubs/vrandecic.html"
    var isUrl = function(url) {
      try {
        url = new URL(url.toString());
        if ((url.protocol.indexOf('http' === 0)) && (url.host)) {
          return value;
        }
      } catch (e) {
        return false;
      }
      return false;
    };

    if (itemRegEx.test(value)) {
      return {
        type: 'wikibase-item',
        value: {
          'entity-type': 'item',
          'numeric-id': parseInt(value.replace(/^Q/, ''))
        }
      };
    } else if (propertyRegEx.test(value)) {
      return {
        type: 'wikibase-property',
        value: {
          'entity-type': 'property',
          'numeric-id': parseInt(value.replace(/^P/, ''))
        }
      };
    } else if (coordinatesRegEx.test(value)) {
      var latitude = value.replace(coordinatesRegEx, '$1');
      var longitude = value.replace(coordinatesRegEx, '$2');
      return {
        type: 'globe-coordinate',
        value: {
          latitude: parseFloat(latitude),
          longitude: parseFloat(longitude),
          altitude: null,
          precision: computeCoordinatesPrecision(latitude, longitude),
          globe: 'http://www.wikidata.org/entity/Q2'
        }
      };
    } else if (languageStringRegEx.test(value)) {
      return {
        type: 'monolingualtext',
        value: {
          language: value.replace(languageStringRegEx, '$1'),
          text: value.replace(languageStringRegEx, '$2')
        }
      };
    } else if (timeRegEx.test(value)) {
      var parts = value.split('/');
      return {
        type: 'time',
        value: {
          time: parts[0],
          timezone: 0,
          before: 0,
          after: 0,
          precision: parseInt(parts[1]),
          calendarmodel: 'http://www.wikidata.org/entity/Q1985727'
        }
      };
    } else if (quantityRegEx.test(value)) {
      return {
        type: 'quantity',
        value: {
          amount: value,
          unit: '1',
          upperBound: value,
          lowerBound: value
        }
      };
    } else {
      value = value.replace(/^["']/, '').replace(/["']$/, '');
      return {
        type: isUrl(value) ? 'url' : 'string',
        value: value
      };
    }
  }

  function matchClaims(wikidataClaims, freebaseClaims) {
    var existingClaims = {};
    var newClaims = {};
    var language = mw.language.getFallbackLanguageChain()[0] || 'en';
    for (var property in freebaseClaims) {
      if (wikidataClaims[property]) {
        existingClaims[property] = freebaseClaims[property];
        var propertyLinks =
            document.querySelectorAll('a[title="Property:' + property + '"]');
        [].forEach.call(propertyLinks, function(propertyLink) {
          propertyLink.parentNode.parentNode.classList
              .add('existing-property');
        });
        for (var freebaseValue in freebaseClaims[property]) {
          var freebaseObject = freebaseClaims[property][freebaseValue];
          freebaseObject.object = freebaseValue;
          var existingWikidataObjects = {};
          var lenI = wikidataClaims[property].length;
          for (var i = 0; i < lenI; i++) {
            var wikidataObject = wikidataClaims[property][i];
            if (wikidataObject.mainsnak.snaktype === 'value') {
              existingWikidataObjects
                 [jsonToTsvValue(wikidataObject.mainsnak.datavalue)] =
                 wikidataObject;
            }
          }
          if (existingWikidataObjects[freebaseValue]) {
            // Existing object, maybe new sources?
            prepareNewSources(
                property,
                freebaseObject,
                language,
                existingWikidataObjects[freebaseValue]
            );
          } else {
            // New object
            prepareNewWikidataStatement(property, freebaseObject, language);
          }
        }
      } else {
        newClaims[property] = freebaseClaims[property];
      }
    }
    var allProperties =
        Object.keys(newClaims).concat(Object.keys(existingClaims));
    getEntityLabels(allProperties, function(err, labels) {
      for (var property in existingClaims) {
        debug.log('Existing claim ' +
            labels[property].labels[language].value);
      }
      for (var property in newClaims) {
        var claims = newClaims[property];
        var propertyLabel = labels[property].labels[language].value;
        debug.log('New claim ' + propertyLabel);
        createNewClaim(property, propertyLabel, claims, language);
      }
    });
  }

  //Normalize year size to 16 digits
  function normalizeTime(time) {
    var matches = /^([-+])(\d+)\-(.*)$/.exec(time);
    return matches[1] +
           ('00000000000' + matches[2]).slice(-11) +
           '-' + matches[3];
  }

  function jsonToTsvValue(dataValue) {
    switch (dataValue.type) {
    case 'quantity':
      return dataValue.value.amount;
    case 'time':
      return normalizeTime(dataValue.value.time) +
             '/' + dataValue.value.precision;
    case 'globecoordinate':
      return '@' + dataValue.value.latitude + '/' + dataValue.value.longitude;
    case 'monolingualtext':
      return dataValue.value.language + ':"' + dataValue.value.text + '"';
    case 'string':
      return '"' + dataValue.value + '"';
    case 'wikibase-entityid':
      switch (dataValue.value['entity-type']) {
        case 'item':
          return 'Q' + dataValue.value['numeric-id'];
        case 'property':
          return 'P' + dataValue.value['numeric-id'];
      }
    }
    debug.log('Unknown data value type ' + dataValue.type);
    return dataValue.value;
  }

  function prepareNewWikidataStatement(property, object, language) {
    getQualifiersAndSourcesLabels(object.qualifiers, object.sources,
        function(err, results) {
      object.sources.forEach(function(source) {
        source.sourcePropertyLabel = results
            .sourcesLabels[source.sourceProperty].labels[language].value;
      });
      object.qualifiers.forEach(function(qualifier) {
        var qualifierProperty = qualifier.qualifierProperty;
        qualifier.qualifierPropertyLabel = results
            .qualifiersLabels[qualifierProperty].labels[language].value;
      });

      var freebaseObject = {
        object: object.object,
        id: object.id,
        qualifiers: object.qualifiers,
        sources: object.sources
      };
      return createNewStatement(property, freebaseObject);
    });
  }

  function prepareNewSources(property, object, language, wikidataStatement) {
    var wikidataSources = ('references' in wikidataStatement) ?
                wikidataStatement.references :
                [];
    var existingSources = {};
    for (var i in wikidataSources) {
      var wikidataObject = wikidataSources[i];
      var snakBag = wikidataSources[i].snaks;
      for (var prop in snakBag) {
        if (!(prop in existingSources)) {
          existingSources[prop] = {};
        }
        for (var j in snakBag[prop]) {
          var snak = snakBag[prop][j];
          if (snak.snaktype === 'value') {
            existingSources[prop][jsonToTsvValue(snak.datavalue)] = true;
          }
        }
      }
    }
    //Filter already present sources
    object.sources = object.sources.filter(function(source) {
      return !existingSources[source.sourceProperty] ||
             !existingSources[source.sourceProperty][source.sourceObject];
    });

    getSourcesLabels(object.sources, function(err, labels) {
      object.sources.forEach(function(source) {
        source.sourcePropertyLabel = labels
            .sourcesLabels[source.sourceProperty].labels[language].value;
      });
      return createNewSources(
          object.sources,
          property,
          object,
          wikidataStatement.id
      );
    });
  }

  function createNewSources(sources, property, object, statementId) {
    getSourcesHtml(sources, property, object).then(function(html) {
      var fragment = document.createDocumentFragment();
      var child = document.createElement('div');
      child.innerHTML = html;
      fragment.appendChild(child);
      // Need to find the correct reference
      var container = document
          .getElementsByClassName('wikibase-statement-' + statementId)[0];
      // Open the references toggle
      var toggler = container.querySelector('a.ui-toggler');
      if (toggler.classList.contains('ui-toggler-toggle-collapsed')) {
        toggler.click();
      }
      var label = toggler.querySelector('.ui-toggler-label');
      var oldLabel =
          parseInt(label.textContent.replace(/.*?(\d+).*?/, '$1'), 10);
      // Update the label
      var newLabel = oldLabel += sources.length;
      newLabel = newLabel === 1 ? '1 reference' : newLabel + ' references';
      label.textContent = newLabel;
      // Append the references
      container = container
          .querySelector('.wikibase-statementview-references')
          .querySelector('.wikibase-listview');
      container.appendChild(fragment);
    });
  }

  function createNewStatement(property, object) {
    getStatementHtml(property, object).then(function(html) {
      var fragment = document.createDocumentFragment();
      var child = document.createElement('div');
      child.innerHTML = html;
      fragment.appendChild(child.firstChild);
      var container = document.getElementById(property)
          .querySelector('.wikibase-statementlistview-listview');
      container.appendChild(fragment);
    });
  }

  function createNewClaim(property, propertyLabel, claims, lang) {
    var newClaim = {
      property: property,
      propertyLabel: propertyLabel,
      objects: []
    };
    var objectsLength = Object.keys(claims).length;
    var i = 0;
    for (var object in claims) {
      var id = claims[object].id;
      var sources = claims[object].sources;
      var qualifiers = claims[object].qualifiers;
      newClaim.objects.push({
        object: object,
        id: id,
        qualifiers: qualifiers,
        sources: sources
      });
      (function(currentNewClaim, currentObject) {
        getQualifiersAndSourcesLabels(qualifiers, sources,
            function(err, results) {
          currentNewClaim.objects.forEach(function(object) {
            if (object.object !== currentObject) {
              return;
            }
            object.sources.forEach(function(source) {
              source.sourcePropertyLabel = results
                  .sourcesLabels[source.sourceProperty].labels[lang].value;
            });
            object.qualifiers.forEach(function(qualifier) {
              var qualifierProperty = qualifier.qualifierProperty;
              qualifier.qualifierPropertyLabel = results
                  .qualifiersLabels[qualifierProperty].labels[lang].value;
            });
          });
          i++;
          if (i === objectsLength) {
            return createNewClaimList(currentNewClaim);
          }
        });
      })(newClaim, object);
    }
  }

  function getQualifiersAndSourcesLabels(qualifiers, sources, callback) {
    var qualifiersProperties = qualifiers.map(function(qualifier) {
      return qualifier.qualifierProperty;
    });
    var sourcesProperties = sources.map(function(source) {
      return source.sourceProperty;
    });
    async.parallel({
      qualifiersLabels: function(callback) {
        getEntityLabels(qualifiersProperties,
            function(err, qualifiersLabels) {
          return callback(null, qualifiersLabels);
        });
      },
      sourcesLabels: function(callback) {
        getEntityLabels(sourcesProperties, function(err, sourcesLabels) {
          return callback(null, sourcesLabels);
        });
      }
    }, function(err, results) {
      return callback(null, results);
    });
  }

  /*
  function getQualifiersLabels(qualifiers, callback) {
    var qualifiersProperties = qualifiers.map(function(qualifier) {
      return qualifier.qualifierProperty;
    });
    getEntityLabels(qualifiersProperties, function(err, qualifiersLabels) {
      return callback(null, {
        qualifiersLabels: qualifiersLabels
      });
    });
  }
  */

  function getSourcesLabels(sources, callback) {
    var sourcesProperties = sources.map(function(source) {
      return source.sourceProperty;
    });
    async.parallel({
      sourcesLabels: function(callback) {
        getEntityLabels(sourcesProperties,
            function(err, sourcesLabels) {
          return callback(null, sourcesLabels);
        });
      }
    }, function(err, results) {
      return callback(null, results);
    });
  }

  function createNewClaimList(newClaim) {
    var container = document
        .querySelector('.wikibase-statementgrouplistview')
        .querySelector('.wikibase-listview');
    var statementPromises = newClaim.objects.map(function(object) {
      return getStatementHtml(newClaim.property, object);
    });

    $.when.apply($, statementPromises).then(function() {
      var statementViewsHtml = Array.prototype.slice.call(arguments).join('');
      var mainHtml = HTML_TEMPLATES.mainHtml
          .replace(/\{\{statement-views\}\}/g, statementViewsHtml)
          .replace(/\{\{property\}\}/g, newClaim.property)
          .replace(/\{\{data-property\}\}/g, newClaim.property)
          .replace(/\{\{property-label\}\}/g, newClaim.propertyLabel);

      var fragment = document.createDocumentFragment();
      var child = document.createElement('div');
      child.innerHTML = mainHtml;
      fragment.appendChild(child.firstChild);
      container.appendChild(fragment);
    });
  }

  function escapeHtml(html) {
    return html
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\"/g, '&quot;');
  }

  function getValueHtml(value) {
    var parsed = tsvValueToJson(value);
    var dataValue = {
        type: getValueTypeFromDataValueType(parsed.type),
        value: parsed.value
      };
    var options = {
        'lang': mw.language.getFallbackLanguageChain()[0] || 'en'
      };

    var api = new mw.Api();
    return api.get({
      action:'wbformatvalue',
      generate:'text/html',
      datavalue:JSON.stringify(dataValue),
      datatype:parsed.type,
      options:JSON.stringify(options)
    }).then(function(result) {
      return result.result;
    });
  }

  function getSourcesHtml(sources, property, object) {
    var sourcePromises = sources.map(function(source) {
      return getValueHtml(source.sourceObject).then(function(formattedValue) {
        return HTML_TEMPLATES.sourceHtml
          .replace(/\{\{source-property\}\}/g, source.sourceProperty)
          .replace(/\{\{data-source-property\}\}/g, source.sourceProperty)
          .replace(/\{\{data-property\}\}/g, property)
          .replace(/\{\{data-object\}\}/g, escapeHtml(object.object))
          .replace(/\{\{source-property-label\}\}/g,
              source.sourcePropertyLabel)
          .replace(/\{\{statement-id\}\}/g, source.sourceId)
          .replace(/\{\{source-object\}\}/g, formattedValue)
          .replace(/\{\{data-source-object\}\}/g, escapeHtml(source.sourceObject))
          .replace(/\{\{data-qualifiers\}\}/g, escapeHtml(JSON.stringify(object.qualifiers)));
      });
    });

    return $.when.apply($, sourcePromises).then(function() {
      return Array.prototype.slice.call(arguments).join('');
    });
  }

  function getQualifiersHtml(qualifiers) {
    var qualifierPromises = qualifiers.map(function(qualifier) {
      return getValueHtml(qualifier.qualifierObject).then(
        function(formattedValue) {
        return HTML_TEMPLATES.qualifierHtml
          .replace(/\{\{qualifier-property\}\}/g,
              qualifier.qualifierProperty)
          .replace(/\{\{data-qualifier-property\}\}/g,
              qualifier.qualifierProperty)
          .replace(/\{\{qualifier-property-label\}\}/g,
            qualifier.qualifierPropertyLabel)
          .replace(/\{\{qualifier-object\}\}/g,
              formattedValue);
      });
    });

    return $.when.apply($, qualifierPromises).then(function() {
      return Array.prototype.slice.call(arguments).join('');
    });
  }

  function getStatementHtml(property, object) {
    return $.when(
        getQualifiersHtml(object.qualifiers),
        getSourcesHtml(object.sources, property, object),
        getValueHtml(object.object)
    ).then(function(qualifiersHtml, sourcesHtml, formattedValue) {
      return HTML_TEMPLATES.statementViewHtml
        .replace(/\{\{object\}\}/g, formattedValue)
        .replace(/\{\{data-object\}\}/g, escapeHtml(object.object))
        .replace(/\{\{data-property\}\}/g, property)
        .replace(/\{\{references\}\}/g,
          object.sources.length === 1 ?
              object.sources.length + ' reference' :
              object.sources.length + ' references')
        .replace(/\{\{sources\}\}/g, sourcesHtml)
        .replace(/\{\{qualifiers\}\}/g, qualifiersHtml)
        .replace(/\{\{statement-id\}\}/g, object.id)
        .replace(/\{\{data-qualifiers\}\}/g, escapeHtml(JSON.stringify(object.qualifiers)));
    });
  }

  function getWikidataEntityData(qid, callback) {
    $.ajax({
      url: WIKIDATA_ENTITY_DATA_URL.replace(/\{\{qid\}\}/, qid) + '?revision=' + mw.config.get('wgRevisionId')
    }).done(function(data) {
      return callback(null, data.entities[qid]);
    }).fail(function() {
      return callback('Invalid revision ID ' + mw.config.get('wgRevisionId'));
    });
  }

  function getFreebaseEntityData(qid, callback) {
    $.ajax({
      url: FAKE_OR_RANDOM_DATA ?
          FREEBASE_ENTITY_DATA_URL.replace(/\{\{qid\}\}/, 'any') :
          FREEBASE_ENTITY_DATA_URL.replace(/\{\{qid\}\}/, qid) + '?dataset=' + dataset
    }).done(function(data) {
      return callback(null, data);
    });
  }

  function getEntityLabels(entities, callback) {
    if (!entities.length) {
      return callback(null, {});
    }
    entities = entities.join('|');
    var languages = mw.language.getFallbackLanguageChain().join('|');
    $.ajax({
      url: WIKIDATA_ENTITY_LABELS_URL
          .replace(/\{\{languages\}\}/, languages)
          .replace(/\{\{entities\}\}/, entities)
    }).done(function(data) {
      return callback(null, data.entities);
    }).fail(function() {
      return callback('Could not get entity labels');
    });
  }

  function setStatementState(id, state, callback) {
    if (!STATEMENT_STATES[state]) {
      return callback('Invalid statement state');
    }
    var user = mw.user.getName();
    var url = FREEBASE_STATEMENT_APPROVAL_URL
        .replace(/\{\{user\}\}/, user)
        .replace(/\{\{state\}\}/, state)
        .replace(/\{\{id\}\}/, id);
    $.post(url, callback);
  }

  // https://www.wikidata.org/w/api.php?action=help&modules=wbcreateclaim
  function createClaim(predicate, object, qualifiers) {
    var value = (tsvValueToJson(object)).value;
    var api = new mw.Api();
    return api.post({
      action: 'wbcreateclaim',
      entity: qid,
      property: predicate,
      snaktype: 'value',
      token: mw.user.tokens.get('editToken'),
      value: JSON.stringify(value),
      summary: WIKIDATA_API_COMMENT
    }).then(function(data) {
      var qualifierPromises = qualifiers.map(function(qualifier) {
        var value = (tsvValueToJson(qualifier.qualifierObject)).value;
        return api.post({
          action: 'wbsetqualifier',
          claim: data.claim.id,
          property: qualifier.qualifierProperty,
          snaktype: 'value',
          token: mw.user.tokens.get('editToken'),
          value: JSON.stringify(value),
          summary: WIKIDATA_API_COMMENT
        })
      });
      return $.when.apply($, qualifierPromises).then(function() {
        return data;
      });
    });
  }

  // https://www.wikidata.org/w/api.php?action=help&modules=wbsetreference
  function createClaimWithReference(predicate, object, qualifiers,
    sourceProperty, sourceObject) {
    var value = (tsvValueToJson(object)).value;
    var api = new mw.Api();
    return createClaim(predicate, object, qualifiers).then(function(data) {
      var dataValue = tsvValueToJson(sourceObject);
      return api.post({
        action: 'wbsetreference',
        statement: data.claim.id,
        snaks: JSON.stringify({
          predicate: [{
            snaktype: 'value',
            property: sourceProperty,
            datavalue: {
              type: getValueTypeFromDataValueType(dataValue.type),
              value: dataValue.value
            }
          }]
        }),
        token: mw.user.tokens.get('editToken'),
        summary: WIKIDATA_API_COMMENT
      });
    });
  }

  // https://www.wikidata.org/w/api.php?action=help&modules=wbgetclaims
  function getClaims(predicate, callback) {
    var api = new mw.Api();
    api.get({
      action: 'wbgetclaims',
      entity: qid,
      property: predicate
    }).done(function(data) {
      return callback(null, data.claims[predicate] || []);
    }).fail(function(error) {
      return callback(error);
    });
  }

  // https://www.wikidata.org/w/api.php?action=help&modules=wbsetreference
  function createReference(predicate, object, sourceProperty,
      sourceObject, callback) {
    var api = new mw.Api();
    api.get({
      action: 'wbgetclaims',
      entity: qid,
      property: predicate
    }).then(function(data) {
      var index = -1;
      for (var i = 0, lenI = data.claims[predicate].length; i < lenI; i++) {
        var claimObject = data.claims[predicate][i];
        if (
            claimObject.mainsnak.snaktype === 'value' &&
            jsonToTsvValue(claimObject.mainsnak.datavalue) === object
        ) {
          index = i;
          break;
        }
      }
      var dataValue = tsvValueToJson(sourceObject);
      var type = getValueTypeFromDataValueType(dataValue.type);
      return api.post({
        action: 'wbsetreference',
        statement: data.claims[predicate][index].id,
        snaks: JSON.stringify({
          predicate: [{
            snaktype: 'value',
            property: sourceProperty,
            datavalue: {
              type: type,
              value: dataValue.value
            }
          }]
        }),
        token: mw.user.tokens.get('editToken'),
        summary: WIKIDATA_API_COMMENT
      });
    }).done(function(data) {
      return callback(null, data);
    }).fail(function(error) {
      return callback(error);
    });
  }

  function getValueTypeFromDataValueType(dataValueType) {
    return wikibase.dataTypeStore.getDataType(dataValueType)
        .getDataValueType();
  }

  function getPropertyNames(callback) {
    var now = Date.now();
    if (localStorage.getItem('f2w_properties')) {
      var properties = JSON.parse(localStorage.getItem('f2w_properties'));
      if (!properties.timestamp) {
        properties.timestamp = 0;
      }
      if (now - properties.timestamp < CACHE_EXPIRY) {
        debug.log('Using cached properties list');
        return callback(null, properties.data);
      }
    }
    var iframe = document.createElement('iframe');
    document.body.appendChild(iframe);

    iframe.addEventListener('load', function() {

      var scraperFunction = function scraperFunction() {
        var properties = {};
        var anchors = document.querySelectorAll('a[href^="/wiki/Property:"]');
        [].forEach.call(anchors, function(a) {
          properties[a.title.replace('Property:', '')] =
          a.parentNode.parentNode.querySelector('td').textContent;
        });
        return properties;
      };

      var script = iframe.contentWindow.document.createElement('script');
      script.textContent = scraperFunction.toString();
      iframe.contentWindow.document.body.appendChild(script);

      var properties = iframe.contentWindow.scraperFunction();
      debug.log('Caching properties list');
      localStorage.setItem('f2w_properties', JSON.stringify({
        timestamp: now,
        data: properties
      }));
      return callback(null, properties);
    }, false);

    iframe.src = LIST_OF_PROPERTIES_URL;
  }

  function getBlacklistedSourceUrls(callback) {
    var now = Date.now();
    if (localStorage.getItem('f2w_blacklist')) {
      var blacklist = JSON.parse(localStorage.getItem('f2w_blacklist'));
      if (!blacklist.timestamp) {
        blacklist.timestamp = 0;
      }
      if (now - blacklist.timestamp < CACHE_EXPIRY) {
        debug.log('Using cached source URL blacklist');
        return callback(null, blacklist.data);
      }
    }
    $.ajax({
      url: FREEBASE_SOURCE_URL_BLACKLIST
    }).done(function(data) {
      if (data && data.parse && data.parse.text && data.parse.text['*']) {
        var blacklist = data.parse.text['*']
            .replace(/\n/g, '')
            .replace(/^.*?<ul>(.*?)<\/ul>.*?$/g, '$1')
            .replace(/<\/li>/g, '')
            .split('<li>').slice(1)
            .map(function(url) {
              return url.trim();
            })
            .filter(function(url) {
              var copy = url;
              if (/\s/g.test(copy) || !/\./g.test(copy)) {
                return false;
              }
              if (!/^https?:\/\//.test(copy)) {
                copy = 'http://' + url;
              }
              try {
                return (new URL(copy)).host !== '';
              } catch (e) {
                return false;
              }
            });
        debug.log('Caching source URL blacklist');
        localStorage.setItem('f2w_blacklist', JSON.stringify({
          timestamp: now,
          data: blacklist
        }));
        return callback(null, blacklist);
      } else {
        // Fail silently
        debug.log('Could not obtain blacklisted source URLs');
        return callback(null);
      }
    }).fail(function() {
      // Fail silently
      debug.log('Could not obtain blacklisted source URLs');
      return callback(null);
    });
  }
});
