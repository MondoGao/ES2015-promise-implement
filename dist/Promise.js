'use strict';

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

/*
Author: MondoGao
Email: mondogao@gmail.com
Github: mondogao
Date: 2017-04-26
 */

/**
 * @typedef {function(reason: *)} PromiseRejectFunctions
 */
/**
 * @typedef {function(resolution: *)} PromiseResolveFunctions
 */
/**
 * @typedef {function(resolve, reject)} GetCapabilitiesExecutorFuntions
 */
/**
 * @typedef {{promise: object, resolve: PromiseResolveFunctions, reject: PromiseRejectFunctions}} PromiseCapabilityRecords
 */
/**
 * @typedef {{capabilities: PromiseCapabilityRecords, handler: (function|string)}} PromiseReactionRecords
 */

/**
 * 一个 Promise 所处的状态
 * @const
 */
var states = {
  PENDING: 'pending',
  FULFILLED: 'fulfilled',
  REJECTED: 'rejected'
};

/**
 * 特殊的两种处理函数
 * @const
 */
var handlerType = {
  IDENTITY: 'Identity',
  THROUER: 'Thrower'
};

/**
 * 判断一个变量是否可以被调用
 * @param executor
 * @return {boolean}
 */
function isCallable(executor) {
  return typeof executor === 'function';
}

/**
 * 判断一个变量是否可以当作构造函数调用，此处因无较好方法直接判断是否为函数
 * @param arg
 * @return {boolean}
 */
function isConstructor(arg) {
  return typeof arg === 'function';
}

/**
 * 判断一个变量是否为 Promise，按标准实现
 * @param x
 * @return {boolean}
 */
function isPromise(x) {
  return (typeof x === 'undefined' ? 'undefined' : _typeof(x)) === 'object' && x.promiseState !== undefined;
}

/**
 * 将传递来的函数加入队列
 * @param queueName - 可被 js 引擎识别的队列名称，此处忽略
 * @param job - 任务函数
 * @param argumentArr - 传递给 job 的参数
 */
function enqueueJob(queueName, job) {
  for (var _len = arguments.length, argumentArr = Array(_len > 2 ? _len - 2 : 0), _key = 2; _key < _len; _key++) {
    argumentArr[_key - 2] = arguments[_key];
  }

  // 断言： argumentArr 的 length 和函数的 length 一致
  setTimeout.apply(undefined, [job, 0].concat(argumentArr));
}

/**
 * ES2015 Promise 实现
 */

var MPromise = function () {
  function MPromise(executor) {
    _classCallCheck(this, MPromise);

    // 1. 如果该函数不是被 new 关键字调用，抛出 TypeError 错误
    if (!new.target) {
      throw new TypeError();
    }

    // 2. 如果 executor 不是一个函数，抛出 TypeError 错误
    if (!isCallable(executor)) {
      throw new TypeError();
    }

    // 3. 创建 Promise 实例的属性
    this.promiseState = states.PENDING;
    this.promiseResult = undefined;
    this.promiseFulfillReactions = [];
    this.promiseRejectReactions = [];

    // 4. 获取用于传入 executor 的 resolve 和 reject 方法
    var resolvingFunctions = createResolvingFunctions(this);

    // 5. 调用 executor 函数，并传入刚刚创建的 resolve 和 reject 方法，如出错则以调用函数的结果 reject 这个 promise
    var completion = null;
    try {
      completion = executor.call(undefined, resolvingFunctions.resolve, resolvingFunctions.reject);
    } catch (err) {
      resolvingFunctions.reject.call(undefined, err);
    }
  }

  _createClass(MPromise, [{
    key: 'then',
    value: function then(onFulfilled, onRejected) {
      var promise = this;

      // 1. 如果 this 指向的不是一个 promise 则报错
      if (!isPromise(promise)) {
        throw new TypeError();
      }

      // 2. 获取 promise 的 constructor 以保证调用子类的构造函数
      var C = promise.constructor;

      // 3. 将该构造函数传入，返回一个 capability 对象；相当于同时完成了实例化和 resolve，reject 函数绑定
      var resultCapability = newPromiseCapability(C);

      return performPromiseThen(promise, onFulfilled, onRejected, resultCapability);
    }
  }]);

  return MPromise;
}();

/**
 * 根据 promise 创建 resolve 和 reject 并将其与 promise 绑定
 * @param promise
 * @return {{resolve: function, reject: function}}
 */


function createResolvingFunctions(promise) {
  // 1. 创建是否已调用过 resolve、reject 的标识，为了保证同一使用对象来进行传递；该状态标识是否进入 resolved 状态
  var alreadyResolved = {
    value: false
  };

  // 2. 创建 resolve 方法
  /**
   * resolve 方法
   * @type {PromiseResolveFunctions}
   * @param resolution
   */
  var resolve = function resolve(resolution) {
    // 1. 断言： resolve 在调用时已绑定 promise
    var promise = resolve.promise;
    var alreadyResolved = resolve.alreadyResolved;

    // 2. 忽略重复调用
    if (alreadyResolved.value) {
      return undefined;
    }

    // 3. 将 promise 标记为 resolved
    alreadyResolved.value = true;

    // 4. 禁止在 resolve 时传入原本的 promise，若传入，直接 reject 这个 promise
    if (promise === resolution) {
      var selfResolutionError = new TypeError();
      return rejectPromise(promise, selfResolutionError);
    }

    // 5. 如果传入的是一个普通的值，直接用该值 fulfill 该 promise
    if ((typeof resolution === 'undefined' ? 'undefined' : _typeof(resolution)) !== 'object') {
      return fulfillPromise(promise, resolution);
    }

    // 6. 如果传入的是一个对象，则获取其 #then 方法
    var then = resolution.then;

    // 7. 若 then 方法不存在或不是函数，则直接用该值 fulfill 该 promise
    if (!isCallable(then)) {
      return fulfillPromise(promise, resolution);
    }

    // 8. 将 promise 和新的 thenable 对象（通常为 promise）传入队列中
    enqueueJob.apply(undefined, ['PromiseJobs', promiseResolveThenableJob].concat([promise, resolution, then]));
  };

  // 3. 将 resolve 方法与 promise 绑定，间接绑定 resolved 状态
  resolve.promise = promise;
  resolve.alreadyResolved = alreadyResolved;

  // 4. 创建 reject 方法，并与 promise 绑定
  /**
   * reject 方法
   * @type {PromiseRejectFunctions}
   * @param reason
   */
  var reject = function promiseReject(reason) {
    // 该方法与 resolve 方法类似，考虑情况更少更简单一些
    var promise = reject.promise;
    var alreadyResolved = reject.alreadyResolved;

    if (alreadyResolved) {
      return undefined;
    }

    alreadyResolved.value = true;

    return rejectPromise(promise, reason);
  };
  reject.promise = promise;
  reject.alreadyResolved = alreadyResolved;

  return {
    resolve: resolve,
    reject: reject
  };
}

/**
 * 用给定的值 fulfill 一个 promise
 * @param promise
 * @param value
 */
var fulfillPromise = function fulfillPromise(promise, value) {
  // 1. 断言： promise 处于 pending 状态
  // 2. 取出 promise 中的待处理动作并将其状态改为 fulfilled
  var reactions = promise.promiseFulfillReactions;
  promise.promiseResult = value;
  promise.promiseFulfillReactions = undefined;
  promise.promiseRejectReactions = undefined;
  promise.promiseState = states.FULFILLED;

  // 3. 将待处理动作加入队列中
  return triggerPromiseReactions(reactions, value);
};

/**
 * 用给定的原因 reject 一个 promise，类似 fulfillPromise
 * @param promise
 * @param reason
 */
function rejectPromise(promise, reason) {
  var reactions = promise.promiseRejectReactions;
  promise.promiseResult = reason;
  promise.promiseFulfillReactions = undefined;
  promise.promiseRejectReactions = undefined;
  promise.promiseState = states.REJECTED;

  return triggerPromiseReactions(reactions, reason);
}

/**
 * 将接收到的待处理事物加入队列
 * @param {PromiseReactionRecords} reactions
 * @param argument
 */
function triggerPromiseReactions(reactions, argument) {
  var _iteratorNormalCompletion = true;
  var _didIteratorError = false;
  var _iteratorError = undefined;

  try {
    for (var _iterator = reactions[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
      var reaction = _step.value;

      enqueueJob.apply(undefined, ['PromiseJobs', promiseReactionJob].concat([reaction, argument]));
    }
  } catch (err) {
    _didIteratorError = true;
    _iteratorError = err;
  } finally {
    try {
      if (!_iteratorNormalCompletion && _iterator.return) {
        _iterator.return();
      }
    } finally {
      if (_didIteratorError) {
        throw _iteratorError;
      }
    }
  }
}

/**
 * 用传入的 argument 的值对 promise 进行 fulfill 或 reject
 * @param reaction
 * @param argument
 */
function promiseReactionJob(reaction, argument) {
  // 1. 断言： reaction 是一个包含 capability 和 handler 的对象，该对象在 then 中被创建，见下文；handler 为向 then 中传递的 onFulfilled 或 onRejected 函数
  var promiseCapability = reaction.capabilities;
  var handler = reaction.handler;

  // 2. 对于特殊 handler 的处理，Identity 和 Thrower 都不对 argument 进行处理
  var handlerResult = undefined;
  try {
    if (handler === handlerType.IDENTITY) {
      handlerResult = argument;
    } else if (handler === handlerType.THROUER) {
      throw argument;
    } else {
      handlerResult = handler.call(undefined, argument);
    }
  } catch (err) {
    return promiseCapability.reject.call(undefined, err);
  }

  return promiseCapability.resolve.call(undefined, handlerResult);
}

/**
 * 接受一个还未被 resolve 的 promise，进行异步的处理
 * @param promiseToResolve - 由该 promsie 的 resolve 函数传递来
 * @param thenable - 原 promise resolve 函数接收到的内部 promise
 * @param then - thenble 的 then 方法
 */
function promiseResolveThenableJob(promiseToResolve, thenable, then) {
  // 1. 重新给 promise 绑定 resolve 和 reject 方法，因为传递来的 promise 一定没有被 resolve
  var resolvingFunctions = createResolvingFunctions(promiseToResolve);

  // 2. 完成 handler 内部返回 promise 后的传递的核心逻辑，将外部 promise 的 resolve，reject 方法传入到内部 promise 的 then 函数中
  var thenCallResult = undefined;
  try {
    thenCallResult = then.call.apply(then, [thenable].concat([resolvingFunctions.resolve, resolvingFunctions.reject]));
  } catch (err) {
    var _resolvingFunctions$r;

    return (_resolvingFunctions$r = resolvingFunctions.reject).call.apply(_resolvingFunctions$r, [undefined].concat([err]));
  }
}

/**
 * then 函数核心逻辑
 * @param promise - 调用 then 的原 promise
 * @param onFulfilled
 * @param onRejected
 * @param resultCapability - 新建的 promiseCapability，包含新 promise 和对应的 resolve，reject 函数
 * @return {MPromise}
 */
function performPromiseThen(promise, onFulfilled, onRejected, resultCapability) {
  // 1. 断言： 传入的 promise 是一个 promise 实例
  // 2. 断言： 传入的 resultCapability 包含 promise 和其对应的 resolve，reject 函数

  // 3. 如果 onFuilfilled，onRejected 不是一个函数，将其标记为特殊函数类型
  if (!isCallable(onFulfilled)) {
    onFulfilled = handlerType.IDENTITY;
  }
  if (!isCallable(onRejected)) {
    onRejected = handlerType.THROUER;
  }

  // 4. 创建可被 promiseReactionJob 处理的行为对象
  /**
   * @type {PromiseReactionRecords}
   */
  var fulfillReaction = {
    capabilities: resultCapability,
    handler: onFulfilled
  };
  var rejectReaction = {
    capabilities: resultCapability,
    handler: onRejected
  };

  // 5. 根据原 promise 的状态将上方行为加入到其相应队列中
  switch (promise.promiseState) {
    case states.PENDING:
      promise.promiseFulfillReactions.push(fulfillReaction);
      promise.promiseRejectReactions.push(rejectReaction);
      break;
    case states.FULFILLED:
      var value = promise.promiseResult;
      enqueueJob.apply(undefined, ['PromiseJobs', promiseReactionJob].concat([fulfillReaction, value]));
      break;
    case states.REJECTED:
      var reason = promise.promiseResult;
      enqueueJob.apply(undefined, ['PromiseJobs', promiseReactionJob].concat([rejectReaction, reason]));
      break;
  }

  // 6. 返回新的 promise
  return resultCapability.promise;
}

/**
 * 根据传入的构造函数构造新的 promsie 并获取到在构造函数中绑定的 resolve，reject 方法
 * @param C - promise 构造函数
 * @return {{promise, resolve, reject}}
 */
function newPromiseCapability(C) {
  // 1. 如果 C 不是一个构造函数则报错
  if (!isConstructor(C)) {
    throw new TypeError();
  }

  // 2. 创建要返回的一体化对象
  var promiseCapability = {
    promise: undefined,
    resolve: undefined,
    reject: undefined
  };

  // 3. 创建传入构造函数中的函数，目的是获取 resolve 和 reject 方法
  var executor = function executor(resolve, reject) {
    // 断言： executor 函数属性中存在 对 promiseCapability 的引用
    var promiseCapability = executor.capability;

    if (promiseCapability.resolve !== undefined || promiseCapability.reject !== undefined) {
      throw new TypeError();
    }

    promiseCapability.resolve = resolve;
    promiseCapability.reject = reject;
  };

  // 4. 创建引用
  executor.capability = promiseCapability;

  var promise = new C(executor);

  // 5. 新建立 promise 的同时应获取到其 resolve 和 reject 方法
  if (!isCallable(promiseCapability.resolve) || !isCallable(promiseCapability.reject)) {
    throw new TypeError();
  }

  promiseCapability.promise = promise;
  return promiseCapability;
}

// TestCase
new MPromise(function (resolve, reject) {
  setTimeout(resolve, 1000, 'inside');
}).then(function (data) {
  return console.log(data);
}).then(function (data) {
  return console.log(data);
}).then(function () {
  return new MPromise(function (resolve, reject) {
    setTimeout(resolve, 1000, 'second inside');
  });
}).then(function (data) {
  return console.log(data);
});

console.log('outside');