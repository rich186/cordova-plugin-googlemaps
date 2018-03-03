var MAPS = {};
var MAP_CNT = 0;
var saltHash = Math.floor(Math.random() * Date.now());
var cordova_exec = require('cordova/exec'),
  common = require('./Common'),
  execCmd = require("./commandQueueExecutor");
var Map = require('./Map');
var DomObserver = require('./DomObserver');
var domPositions = DomObserver.getDomPositions();

function getMapInstance(div, mapOptions) {
  var mapId, elem, elemId;

  //------------------------------------------
  // If the variable `div` is DOM element,
  // change the backgroundColor as gray
  // until the map is ready.
  //------------------------------------------
  if (common.isDom(div)) {
    mapId = div.getAttribute("__pluginMapId");
    if (!mapOptions || mapOptions.visible !== false) {
      div.style.backgroundColor = "rgba(200, 200, 200, 0.5)";
    }
  }

  //--------------------------------------------------
  // Some people try to execute `Map.getMap()`
  // onto the map div that has been already assigned
  // to another map instance.
  // In that case, removes the previous map instance,
  // then assigns a new map.
  //--------------------------------------------------
  if (mapId && MAPS[mapId].getDiv() !== div) {
    elem = MAPS[mapId].getDiv();
    while(elem && elem.nodeType === Node.ELEMENT_NODE) {
      elemId = elem.getAttribute("__pluginDomId");
      if (elemId && elemId in domPositions) {
        domPositions[elemId].containMapIDs = domPositions[elemId].containMapIDs || {};
        delete domPositions[elemId].containMapIDs[mapId];
        if ((Object.keys(domPositions[elemId].containMapIDs).length) < 1) {
          delete domPositions[elemId];
        }
      }
      elem = elem.parentNode;
    }
    MAPS[mapId].remove();
    mapId = undefined;
  }

  //------------------------------------------------------------------
  // The maps plugin v1 returns the map instance
  // if the map is already created, but they execute `Map.getMap()`
  // for the same map div.
  //
  // In order to keep the backward compatibility,
  // return the map instance.
  // (but not recommended this code style)
  //------------------------------------------------------------------
  if (mapId && mapId in MAPS) {
    return MAPS[mapId];
  } else {
    mapId = "map_" + MAP_CNT + "_" + saltHash;
  }

  var map = new Map(mapId, execCmd);

  // Catch all events for this map instance, then pass to the instance.
  document.addEventListener(mapId, nativeCallback.bind(map));

  map.on('div_changed', function(oldDiv, newDiv) {
    if (common.isDom(oldDiv)) {
      oldDiv.removeAttribute('__pluginMapId');
      var ele = oldDiv;
      while(ele && ele != document.body.parentNode) {
        elemId = ele.getAttribute('__pluginDomId');
        if (elemId) {
          domPositions[elemId].containMapIDs = domPositions[elemId].containMapIDs || {};
          delete domPositions[elemId].containMapIDs[mapId];
          if ((Object.keys(domPositions[elemId].containMapIDs)).length < 1) {
            delete domPositions[elemId];
          }
        }
        ele.removeAttribute('__pluginDomId');
        if (ele.classList) {
          ele.classList.remove('_gmaps_cdv_');
        } else if (ele.className) {
          ele.className = ele.className.replace(/_gmaps_cdv_/g, "");
          ele.className = ele.className.replace(/\s+/g, " ");
        }
        ele = ele.parentNode;
      }
    }

    if (common.isDom(newDiv)) {

      elemId = common.getPluginDomId(newDiv);
      //console.log("---> setDiv() = " + elemId + ", mapId = " + mapId);

      elem = newDiv;
      var isCached;
      while(elem && elem.nodeType === Node.ELEMENT_NODE) {
        //
        // if (common.getStyle(elem, "-webkit-overflow-scrolling") === "touch") {
        //   // Disable scrolling, becase the `scroll` events are not fired.
        //   elem.style["-webkit-overflow-scrolling"] = "auto";
        //   elem.addEventListener('touchstart', self._onTouchEvents.bind(self));
        //   elem.addEventListener('touchmove', self._onTouchEvents.bind(self));
        //   elem.addEventListener('touchend', self._onTouchEvents.bind(self));
        //   elem.addEventListener('touchcancel', self._onTouchEvents.bind(self));
        //   elem.addEventListener('touchleave', self._onTouchEvents.bind(self));
        // }
        elemId = common.getPluginDomId(elem);
        isCached = elemId in domPositions;
        domPositions[elemId] = {
          pointerEvents: common.getStyle(elem, 'pointer-events'),
          isMap: false,
          size: common.getDivRect(elem),
          zIndex: common.getZIndex(elem),
          children: (elemId in domPositions ? domPositions[elemId].children : []),
          overflowX: common.getStyle(elem, "overflow-x"),
          overflowY: common.getStyle(elem, "overflow-y"),
          containMapIDs: (isCached ? domPositions[elemId].containMapIDs : {})
        };
        domPositions[elemId].containMapIDs[mapId] = 1;
        elem = elem.parentNode;
      }

      elemId = common.getPluginDomId(newDiv);
      domPositions[elemId].isMap = true;
    }
  });

  map.one('remove', function() {
      document.removeEventListener(mapId, nativeCallback);
      var div = map.getDiv();
      if (!div) {
        div = document.querySelector("[__pluginMapId='" + mapId + "']");
      }
      if (div) {
        div.removeAttribute('__pluginMapId');
      }
      //console.log("--->removeMap mapId = " + mapId);

      var keys = Object.keys(domPositions);
      var elemId;
      for (var i = 0; i < keys.length; i++) {
        elemId = keys[i];
        domPositions[elemId].containMapIDs = domPositions[elemId].containMapIDs || {};
        delete domPositions[elemId].containMapIDs[mapId];
        if ((Object.keys(domPositions[elemId].containMapIDs)).length < 1) {
          delete domPositions[elemId];
        }
      }
      MAPS[mapId].destroy();
      delete MAPS[mapId];
      map = undefined;

      if ((Object.keys(MAPS)).length === 0) {
        common._clearInternalCache();

        isSuspended = true;
        cordova_exec(null, null, 'CordovaGoogleMaps', 'pause', []);
      }
  });
  MAP_CNT++;
  MAPS[mapId] = map;
  isSuspended = false;
  isThereAnyChange = true;
  isChecking = false;



    var args = [mapId];
    for (var i = 0; i < arguments.length; i++) {
        args.push(arguments[i]);
    }

  if (common.isDom(div)) {
    div.setAttribute("__pluginMapId", mapId);

    elemId = common.getPluginDomId(div);
//console.log("---> map.getMap() = " + elemId + ", mapId = " + mapId);

    elem = div;
    var isCached;
    while(elem && elem.nodeType === Node.ELEMENT_NODE) {
      elemId = common.getPluginDomId(elem);
      isCached = elemId in domPositions;
      domPositions[elemId] = {
        pointerEvents: common.getStyle(elem, 'pointer-events'),
        isMap: false,
        size: common.getDivRect(elem),
        zIndex: common.getZIndex(elem),
        children: [],
        overflowX: common.getStyle(elem, "overflow-x"),
        overflowY: common.getStyle(elem, "overflow-y"),
        containMapIDs: (isCached ? domPositions[elemId].containMapIDs : {})
      };
      domPositions[elemId].containMapIDs[mapId] = 1;
      elem = elem.parentNode;
    }

    elemId = common.getPluginDomId(div);
    domPositions[elemId].isMap = true;

    //console.log("--->getMap (start)", JSON.parse(JSON.stringify(domPositions)));
    cordova_exec(function() {
      cordova_exec(function() {
        map.getMap.apply(map, args);
      }, null, 'CordovaGoogleMaps', 'putHtmlElements', [domPositions]);
    }, null, 'CordovaGoogleMaps', 'resume', []);
    //resetTimer({force: true});
  } else {
    map.getMap.apply(map, args);
  }

  return map;
}

function nativeCallback(params) {
  var args = params.args || [];
  args.unshift(params.evtName);
  this[params.callback].apply(this, args);
}

module.exports = {
  getMapInstance: getMapInstance,
  getMaps: function() {
    return MAPS;
  }
};
