import {DEFAULT_SELECTOR, DISPATCH_TYPE, PATCH_STATE_TYPE, STATE_TYPE,} from '../constants';
import {noop, withDeserializer, withSerializer} from "../serialization";

import shallowDiff from './shallowDiff';

/**
 * Responder for promisified results
 * @param  {object} dispatchResult The result from `store.dispatch()`
 * @param  {function} send         The function used to respond to original message
 * @return {undefined}
 */
const promiseResponder = (dispatchResult, send) => {
  Promise
      .resolve(dispatchResult)
      .then((res) => {
        send({
          error: null,
          value: res
        });
      })
      .catch((err) => {
        console.error('error dispatching result:', err);
        send({
          error: err.message,
          value: null
        });
      });
};

/**
 * @param {Object} store A Redux store
 * @param {Object} selectors An object with keys being ids for selectors, values being functions to compute store data subset. You can use reselect selectors here.
 * @param {Object} options An object of form {portName, dispatchResponder, serializer, deserializer}, where `portName` is a required string and defines the name of the port for state transition changes, `dispatchResponder` is a function that takes the result of a store dispatch and optionally implements custom logic for responding to the original dispatch message,`serializer` is a function to serialize outgoing message payloads (default is passthrough), and `deserializer` is a function to deserialize incoming message payloads (default is passthrough)
 */
export const wrapStoreSelectors = (store, selectors, {
  portName,
  dispatchResponder,
  serializer = noop,
  deserializer = noop
}) => {
  if (!portName) {
    throw new Error('portName is required in options');
  }
  if (typeof serializer !== 'function') {
    throw new Error('serializer must be a function');
  }
  if (typeof deserializer !== 'function') {
    throw new Error('deserializer must be a function');
  }

  // set dispatch responder as promise responder
  if (!dispatchResponder) {
    dispatchResponder = promiseResponder;
  }

  /**
   * Respond to dispatches from UI components
   */
  const dispatchResponse = (request, sender, sendResponse) => {
    if (request.type === DISPATCH_TYPE && request.portName === portName) {
      const action = Object.assign({}, request.payload, {
        _sender: sender
      });

      let dispatchResult = null;

      try {
        dispatchResult = store.dispatch(action);
      } catch (e) {
        dispatchResult = Promise.reject(e.message);
        console.error(e);
      }

      dispatchResponder(dispatchResult, sendResponse);
      return true;
    }
  };

  /**
   * Setup for state updates
   */
  const connectState = (port) => {
    if (port.name !== portName) {
      return;
    }

    const serializedMessagePoster = withSerializer(serializer)((...args) => port.postMessage(...args));

    const state = store.getState();
    const prevStates = {};

    Object.keys(selectors).forEach((sKey) => prevStates[sKey] = selectors[sKey](state)); // Execute all selectors on store state

    const patchState = () => {
      const state = store.getState();

      Object.keys(selectors).forEach((sKey) => {
        const newValue = selectors[sKey](state);
        const diff = shallowDiff(prevStates[sKey], newValue);

        if (diff.length) {
          prevStates[sKey] = newValue;
          serializedMessagePoster({
            type: PATCH_STATE_TYPE,
            key: sKey,
            payload: diff,
          });
        }
      });
    };

    // Send patched state down connected port on every redux store state change
    const unsubscribe = store.subscribe(patchState);

    // when the port disconnects, unsubscribe the sendState listener
    port.onDisconnect.addListener(unsubscribe);

    // Send store's initial state through port
    Object.keys(selectors).forEach((sKey) => {
      serializedMessagePoster({
        type: STATE_TYPE,
        key: sKey,
        payload: prevStates[sKey],
      });
    });
  };

  const withPayloadDeserializer = withDeserializer(deserializer);
  const shouldDeserialize = (request) => request.type === DISPATCH_TYPE && request.portName === portName;

  /**
   * Setup action handler
   */
  withPayloadDeserializer((...args) => chrome.runtime.onMessage.addListener(...args))(dispatchResponse, shouldDeserialize);

  /**
   * Setup external action handler
   */
  if (chrome.runtime.onMessageExternal) {
    withPayloadDeserializer((...args) => chrome.runtime.onMessageExternal.addListener(...args))(dispatchResponse, shouldDeserialize);
  } else {
    console.warn('runtime.onMessageExternal is not supported');
  }

  /**
   * Setup extended connection
   */
  chrome.runtime.onConnect.addListener(connectState);

  /**
   * Setup extended external connection
   */
  if (chrome.runtime.onConnectExternal) {
    chrome.runtime.onConnectExternal.addListener(connectState);
  } else {
    console.warn('runtime.onConnectExternal is not supported');
  }
};

/**
 * Wraps a Redux store so that proxy stores can connect to it.
 * @param {Object} store A Redux store
 * @param {Object} options An object of form {portName, dispatchResponder, serializer, deserializer}, where `portName` is a required string and defines the name of the port for state transition changes, `dispatchResponder` is a function that takes the result of a store dispatch and optionally implements custom logic for responding to the original dispatch message,`serializer` is a function to serialize outgoing message payloads (default is passthrough), and `deserializer` is a function to deserialize incoming message payloads (default is passthrough)
 */
export default (store, options) => wrapStoreSelectors(store, {[DEFAULT_SELECTOR]: (state => state)}, options);
