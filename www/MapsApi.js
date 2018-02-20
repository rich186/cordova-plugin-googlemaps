var cordovaExec = require('cordova/exec');

var EMPTY_ARRAY = [];

function MapsApi() {
  this.isSuspended = true;
  this.queueSize = 10;
  this.queue = [];
  this.execInQueue = this.execInQueue.bind(this);
  this.isQueueStopped = false;
}

MapsApi.prototype.exec = function exec(method, args, options) {
  var params = options || {};

  return new Promise(function(resolve, reject) {
    cordovaExec(resolve, function(message) {
      reject(new Error(message));
    }, params.pluginId || 'CordovaGoogleMaps', method, args || EMPTY_ARRAY);
  });
};

MapsApi.prototype.pause = function() {
  if (this.isSuspended) {
    return Promise.resolve();
  }

  this.isSuspended = true;
  return this.exec('pause');
};

MapsApi.prototype.resume = function() {
  if (!this.isSuspended) {
    return Promise.resolve();
  }

  this.isSuspended = false;
  return this.exec('resume');
};

MapsApi.prototype.execInQueue = function(success, error, pluginName, methodName, args, execOptions) {
  execOptions = execOptions || {};
  var self = this;

  if (this.isQueueStopped) {
    return Promise.resolve();
  }

  if (this.queue.length >= this.queueSize || execOptions.sync && this.queue.length) {
    return Promise.all(this.queue)
      .then(function() {
        return self.execInQueue(success, error, pluginName, methodName, args, execOptions);
      });
  }

  var removeFromQueue = function(value) {
    var index = self.queue.indexOf(promise);

    if (index !== -1) {
      self.queue.splice(index, 1);
    }

    return value && value instanceof Error ? Promise.reject(value) : value;
  };

  var promise = this.exec(methodName, args, { pluginId: pluginName })
    .then(removeFromQueue, removeFromQueue)
    .then(success, error);
  this.queue.push(promise);

  return promise;
};

MapsApi.prototype.stopExecutionQueue = function() {
  this.isQueueStopped = true;
};

module.exports = MapsApi;
