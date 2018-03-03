/* global cordova, plugin, CSSPrimitiveValue */
var MapsApi = require('./MapsApi');
var mapsApi = new MapsApi();

var cordova_exec = require('cordova/exec');
var execCmd = require("./commandQueueExecutor");
var pluginInit = require("./pluginInit");
var MapFactory = require("./MapFactory");

var isSuspended = false;

if (!cordova) {
  document.addEventListener("deviceready", function() {
    mapsApi.pause();
  }, {
    once: true
  });
} else {

  var event = require('./event'),
      common = require('./Common'),
      BaseClass = require('./BaseClass'),
      BaseArrayClass = require('./BaseArrayClass');

  var Map = require('./Map');
  var LatLng = require('./LatLng');
  var LatLngBounds = require('./LatLngBounds');
  var Location = require('./Location');
  var Marker = require('./Marker');
  var Circle = require('./Circle');
  var Polyline = require('./Polyline');
  var Polygon = require('./Polygon');
  var TileOverlay = require('./TileOverlay');
  var GroundOverlay = require('./GroundOverlay');
  var HtmlInfoWindow = require('./HtmlInfoWindow');
  var KmlOverlay = require('./KmlOverlay');
  var encoding = require('./encoding');
  var spherical = require('./spherical');
  var poly = require('./poly');
  var Geocoder = require('./Geocoder');
  var LocationService = require('./LocationService');
  var Environment = require('./Environment');
  var MapTypeId = require('./MapTypeId');

  // The pluginInit.js must execute before loading HTML is completed.
  pluginInit();

  /*****************************************************************************
   * Add event lister to all html nodes under the <body> tag.
   *****************************************************************************/
  (function() {
    // If <body> is not ready yet, wait 25ms, then execute this function again.
    if (!document.body || !document.body.firstChild) {
      common.nextTick(arguments.callee, 25);
      return;
    }

    var isChecking = false;
    var doNotTraceTags = [
      "svg", "p", "pre", "script", "style"
    ];

    var followPositionTimer = null;
    var followPositionTimerCnt = 0;
    var prevMapRects = {};
    var scrollEndTimer = null;
    function followMapDivPositionOnly(opts) {
      opts = opts || {};
      var mapRects = {};
      var MAPS = MapFactory.getMaps();
      var mapIDs = Object.keys(MAPS);
      var changed = false;
      var mapId, map;
      for (var i = 0; i < mapIDs.length; i++) {
        mapId = mapIDs[i];
        map = MAPS[mapId];
        if (map && map.getVisible() && map.getDiv() && common.shouldWatchByNative(map.getDiv())) {
          var mapDiv = map.getDiv();
          var divId = mapDiv.getAttribute("__pluginDomId");
          mapRects[divId] = {
            size: common.getDivRect(mapDiv),
            zIndex: common.getZIndex(mapDiv)
          };
          if (!changed && prevMapRects && (divId in prevMapRects) && (
            prevMapRects[divId].size.left !== mapRects[divId].size.left ||
            prevMapRects[divId].size.top !== mapRects[divId].size.top ||
            prevMapRects[divId].size.width !== mapRects[divId].size.width ||
            prevMapRects[divId].size.height !== mapRects[divId].size.height ||
            prevMapRects[divId].zIndex !== mapRects[divId].zIndex)) {
            changed = true;
          }
        }
      }
      prevMapRects = mapRects;
      if (changed || opts.force) {
        cordova_exec(null, null, 'CordovaGoogleMaps', 'updateMapPositionOnly', [mapRects]);
      }
    }

    document.body.addEventListener("transitionend", function(e) {
      setTimeout(function() {
        common.nextTick(function() {
          if (e.target.hasAttribute("__pluginDomId")) {
            //console.log("transitionend", e.target.getAttribute("__pluginDomId"));
            var isMapChild = false;
            var ele = e.target;
            while(!isMapChild && ele && ele.nodeType === Node.ELEMENT_NODE) {
              isMapChild = ele.hasAttribute("__pluginMapId");
              ele = ele.parentNode;
            }
            traceDomTree(e.target, e.target.getAttribute("__pluginDomId"), isMapChild);

            isSuspended = true;
            isThereAnyChange = true;
            isChecking = false;
            resetTimer({force: true});
          }
        });
      }, 100);
    }, true);

    document.body.addEventListener("scroll", function(e) {
      if (scrollEndTimer) {
        clearTimeout(scrollEndTimer);
      }
      scrollEndTimer = setTimeout(onScrollEnd, 100);
      followMapDivPositionOnly();
    }, true);
    function onScrollEnd() {
      isThereAnyChange = true;
      common.nextTick(putHtmlElements);
    }

    function removeDomTree(node) {
      if (!node || !node.querySelectorAll) {
        return;
      }
      var MAPS = MapFactory.getMaps();
      var elemId, mapId;
      var children = node.querySelectorAll('[__pluginDomId]');
      if (children && children.length > 0) {
        var isRemoved = node._isRemoved;
        var child;
        for (var i = 0; i < children.length; i++) {
          child = children[i];
          elemId = child.getAttribute('__pluginDomId');
          if (isRemoved) {
            child.removeAttribute('__pluginDomId');
            if (child.hasAttribute('__pluginMapId')) {
              // If no div element, remove the map.
              mapId = child.getAttribute('__pluginMapId');
//console.log("---->no map div, elemId = " + elemId + ", mapId = " + mapId);
              if (mapId in MAPS) {
                MAPS[mapId].remove();
              }
            }
            delete domPositions[elemId];
          }
          common._removeCacheById(elemId);
        }
      }
      if (node.hasAttribute("__pluginDomId")) {
        elemId = node.getAttribute('__pluginDomId');
        if (node._isRemoved) {
          node.removeAttribute('__pluginDomId');
          if (node.hasAttribute('__pluginMapId')) {
            // If no div element, remove the map.
            mapId = node.getAttribute('__pluginMapId');
            if (mapId in MAPS) {
//console.log("---> map.remove() = " + elemId);
              MAPS[mapId].remove();
            }
          }
          delete domPositions[elemId];
        }
        common._removeCacheById(elemId);
      }
    }
    //----------------------------------------------
    // Observe styles and children
    //----------------------------------------------
    var isThereAnyChange = true;
    (function() {

      var observer = new MutationObserver(function(mutations) {
        common.nextTick(function() {
          var i, mutation, targetCnt, node, j, elemId;
          for (j = 0; j < mutations.length; j++) {
            mutation = mutations[j];
            targetCnt = 0;
            if (mutation.type === "childList") {
              if (mutation.addedNodes) {
                for (i = 0; i < mutation.addedNodes.length; i++) {
                  node = mutation.addedNodes[i];
                  if (node.nodeType !== Node.ELEMENT_NODE) {
                    continue;
                  }
                  targetCnt++;
                  setDomId(node);
                }
              }
              if (mutation.removedNodes) {
                for (i = 0; i < mutation.removedNodes.length; i++) {
                  node = mutation.removedNodes[i];
                  if (node.nodeType !== Node.ELEMENT_NODE || !node.hasAttribute("__pluginDomId")) {
                    continue;
                  }
                  targetCnt++;
                  node._isRemoved = true;
                  removeDomTree(node);
                }
              }
            } else {
              if (mutation.target.nodeType !== Node.ELEMENT_NODE) {
                return;
              }
              if (mutation.target.hasAttribute("__pluginDomId")) {
                traceDomTree(mutation.target, mutation.target.getAttribute("__pluginDomId"), false);
              }
              elemId = mutation.target.getAttribute("__pluginDomId");
              //console.log('style', elemId, common.shouldWatchByNative(mutation.target), mutation);
            }

          }
          isThereAnyChange = true;
          common.nextTick(putHtmlElements);
        });
      });
      observer.observe(document.body.parentElement, {
        attributes : true,
        childList: true,
        subtree: true,
        attributeFilter: ['style', 'class']
      });

    })();

    function setDomId(element) {
      common.getPluginDomId(element);
      if (element.children) {
        for (var i = 0; i < element.children.length; i++) {
          common.getPluginDomId(element.children[i]);
        }
      }
    }


    //----------------------------------------------
    // Send the DOM hierarchy to native side
    //----------------------------------------------
    var DomObserver = require("./DomObserver");
    var domPositions = DomObserver.getDomPositions();
    var shouldUpdate = false;
    var doNotTrace = false;
    var checkRequested = false;

    function putHtmlElements() {
      var MAPS = MapFactory.getMaps();
      if (isChecking) {
        checkRequested = true;
        return;
      }
      checkRequested = false;
      if (!isThereAnyChange) {
        if (!isSuspended) {
          //console.log("-->pause(320)");
          cordova_exec(null, null, 'CordovaGoogleMaps', 'pause', []);
        }

        //console.log("-->isSuspended = true");
        isSuspended = true;
        isThereAnyChange = false;
        isChecking = false;
        return;
      }
      isChecking = true;

      //-------------------------------------------
      // If there is no visible map, stop checking
      //-------------------------------------------
      var touchableMapList, i, mapId, map;
      touchableMapList = [];
      var mapIDs = Object.keys(MAPS);
      for (i = 0; i < mapIDs.length; i++) {
        mapId = mapIDs[i];
        map = MAPS[mapId];
        if (map &&
          map.getVisible() && map.getClickable() && map.getDiv() && common.shouldWatchByNative(map.getDiv())) {
          touchableMapList.push(mapId);
        }
      }
      if (touchableMapList.length === 0) {
//console.log("--->touchableMapList.length = 0");
        if (!isSuspended) {
//        console.log("-->pause, isSuspended = true");
          cordova_exec(null, null, 'CordovaGoogleMaps', 'pause', []);
          isSuspended = true;
          isThereAnyChange = false;
        }
        isChecking = false;
        return;
      }

      if (checkRequested) {
//console.log("--->checkRequested");
        setTimeout(function() {
          isChecking = false;
          common.nextTick(putHtmlElements);
        }, 50);
        return;
      }
      //-------------------------------------------
      // Should the plugin update the map positions?
      //-------------------------------------------

      common._clearInternalCache();
      common.getPluginDomId(document.body);
      traceDomTree(document.body, "root", false);

      // If the map div is not displayed (such as display='none'),
      // ignore the map temporally.
      var stopFlag = false;
      var mapElemIDs = [];
      mapIDs = Object.keys(MAPS);
      (function() {
        var ele, mapId, div, elemId;
        for (var i = 0; i < mapIDs.length; i++) {
          mapId = mapIDs[i];
          div = MAPS[mapId].getDiv();
          if (div) {
            elemId = div.getAttribute("__pluginDomId");
            if (elemId) {
              if (elemId in domPositions) {
                mapElemIDs.push(elemId);
              } else {
                // Is the map div removed?
                ele = document.querySelector("[__pluginMapId='" + mapId + "']");
                if (!ele) {
                  // If no div element, remove the map.
                  if (mapId in MAPS) {
                    MAPS[mapId].remove();
                    return;
                  }
                  stopFlag = true;
                }
              }
            } else {
              // the map div is removed
              if (mapId in MAPS) {
                MAPS[mapId].remove();
                return;
              }
              stopFlag = true;
            }
          // } else {
          //   // the map div is removed
          //   console.log("mapId = " + mapId + " is already removed");
          //   if (mapId in MAPS) {
          //     MAPS[mapId].remove();
          //     return;
          //   }
          //   stopFlag = true;
          }
        }
      })();
      if (stopFlag) {
        // There is no map information (maybe timining?)
        // Try again.
        isThereAnyChange = true;
        setTimeout(function() {
          isChecking = false;
          common.nextTick(putHtmlElements);
        }, 50);
        return;
      }

      //-----------------------------------------------------------------
      // Ignore the elements that their z-index is smaller than map div
      //-----------------------------------------------------------------
      if (checkRequested) {
        setTimeout(function() {
          isChecking = false;
          common.nextTick(putHtmlElements);
        }, 50);
        return;
      }
      //-----------------------------------------------------------------
      // Pass information to native
      //-----------------------------------------------------------------
      if (isSuspended) {
        //console.log("-->resume(470)");
        cordova_exec(null, null, 'CordovaGoogleMaps', 'resume', []);
        isSuspended = false;
      }
      //console.log("--->putHtmlElements to native (start)", JSON.parse(JSON.stringify(domPositions)));
      cordova_exec(function() {
        //console.log("--->putHtmlElements to native (done)");
        if (checkRequested) {
          setTimeout(function() {
            isChecking = false;
            common.nextTick(putHtmlElements);
          }, 50);
          return;
        }
        isChecking = false;
        isThereAnyChange = false;
        isSuspended = true;
        cordova_exec(null, null, 'CordovaGoogleMaps', 'pause', []);
      }, null, 'CordovaGoogleMaps', 'putHtmlElements', [domPositions]);
      child = null;
      parentNode = null;
      elemId = null;
      children = null;
    }



    function traceDomTree(element, elemId, isMapChild) {
      if (doNotTraceTags.indexOf(element.tagName.toLowerCase()) > -1 ||
        !common.shouldWatchByNative(element)) {
        removeDomTree(element);
        return;
      }

      // Get the z-index CSS
      var zIndexProp = common.getZIndex(element);

      // Calculate dom clickable region
      var rect = common.getDivRect(element);

      // Stores dom information
      var isCached = elemId in domPositions;
      domPositions[elemId] = {
        pointerEvents: common.getStyle(element, 'pointer-events'),
        isMap: element.hasAttribute("__pluginMapId"),
        size: rect,
        zIndex: zIndexProp,
        overflowX: common.getStyle(element, "overflow-x"),
        overflowY: common.getStyle(element, "overflow-y"),
        children: [],
        containMapIDs: (isCached ? domPositions[elemId].containMapIDs : {})
      };
      var containMapCnt = (Object.keys(domPositions[elemId].containMapIDs)).length;
      isMapChild = isMapChild || domPositions[elemId].isMap;
      if ((containMapCnt > 0 || isMapChild || domPositions[elemId].pointerEvents === "none" || zIndexProp.isInherit) && element.children.length > 0) {
        var child;
        for (var i = 0; i < element.children.length; i++) {
          child = element.children[i];
          if (doNotTraceTags.indexOf(child.tagName.toLowerCase()) > -1 ||
            !common.shouldWatchByNative(child)) {
            continue;
          }

          var childId = common.getPluginDomId(child);
          domPositions[elemId].children.push(childId);
          traceDomTree(child, childId, isMapChild);
        }
      }
    }

    // This is the special event that is fired by the google maps plugin
    // (Not generic plugin)
    function resetTimer(opts) {
      opts = opts || {};
      if (opts.force) {
        isThereAnyChange = true;
        isSuspended = false;
      }

      common.nextTick(function() {
        putHtmlElements();
        if (opts.force) {
          followMapDivPositionOnly(opts);
        }
      });
    }

    document.addEventListener("deviceready", putHtmlElements, {
      once: true
    });
    document.addEventListener("plugin_touch", resetTimer);
    window.addEventListener("orientationchange", function() {
      var cnt = 30;
      var timer = setInterval(function() {
        cnt--;
        if (cnt > 0) {
          resetTimer({force: true});
        } else {
          clearInterval(timer);
        }
      }, 50);
    });

    //--------------------------------------------
    // Hook the backbutton of Android action
    //--------------------------------------------
    var anotherBackbuttonHandler = null;
    function onBackButton(e) {
      common.nextTick(putHtmlElements);  // <-- super important!
      if (anotherBackbuttonHandler) {
        // anotherBackbuttonHandler must handle the page moving transaction.
        // The plugin does not take care anymore if another callback is registered.
        anotherBackbuttonHandler(e);
      } else {
        cordova_exec(null, null, 'CordovaGoogleMaps', 'backHistory', []);
      }
    }
    document.addEventListener("backbutton", onBackButton);

    var _org_addEventListener = document.addEventListener;
    var _org_removeEventListener = document.removeEventListener;
    document.addEventListener = function(eventName, callback) {
      var args = Array.prototype.slice.call(arguments, 0);
      if (eventName.toLowerCase() !== "backbutton") {
        _org_addEventListener.apply(this, args);
        return;
      }
      if (!anotherBackbuttonHandler) {
        anotherBackbuttonHandler = callback;
      }
    };
    document.removeEventListener = function(eventName, callback) {
      var args = Array.prototype.slice.call(arguments, 0);
      if (eventName.toLowerCase() !== "backbutton") {
        _org_removeEventListener.apply(this, args);
        return;
      }
      if (anotherBackbuttonHandler === callback) {
        anotherBackbuttonHandler = null;
      }
    };



    /*****************************************************************************
     * Name space
     *****************************************************************************/
    var singletonLocationService = new LocationService(execCmd);
    module.exports = {
      event: event,
      Animation: {
          BOUNCE: 'BOUNCE',
          DROP: 'DROP'
      },

      BaseClass: BaseClass,
      BaseArrayClass: BaseArrayClass,
      Map: {
        getMap: MapFactory.getMapInstance
      },
      HtmlInfoWindow: HtmlInfoWindow,
      LatLng: LatLng,
      LatLngBounds: LatLngBounds,
      Marker: Marker,
      MapTypeId: MapTypeId,
      environment: Environment,
      Geocoder: Geocoder,
      LocationService: singletonLocationService,
      geometry: {
          encoding: encoding,
          spherical: spherical,
          poly: poly
      }
    };

  }());


  cordova.addConstructor(function() {
      if (!window.Cordova) {
          window.Cordova = cordova;
      }
      window.plugin = window.plugin || {};
      window.plugin.google = window.plugin.google || {};
      window.plugin.google.maps = window.plugin.google.maps || module.exports;
      document.addEventListener("deviceready", function() {
          // workaround for issue on android-19: Cannot read property 'maps' of undefined
          if (!window.plugin) { console.warn('re-init window.plugin'); window.plugin = window.plugin || {}; }
          if (!window.plugin.google) { console.warn('re-init window.plugin.google'); window.plugin.google = window.plugin.google || {}; }
          if (!window.plugin.google.maps) { console.warn('re-init window.plugin.google.maps'); window.plugin.google.maps = window.plugin.google.maps || module.exports; }

          // Check the Google Maps Android API v2 if the device platform is Android.
          if (/Android/i.test(window.navigator.userAgent)) {
              //------------------------------------------------------------------------
              // If Google Maps Android API v2 is not available,
              // display the warning alert.
              //------------------------------------------------------------------------
              cordova.exec(null, function(message) {
                  alert(message);
              }, 'Environment', 'isAvailable', ['']);
          }
      }, {
        once: true
      });
  });
}
