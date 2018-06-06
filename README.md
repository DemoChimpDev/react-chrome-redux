# React Chrome Redux With Selectors Support
A set of utilities for building Redux applications in Google Chrome extensions. Although [React](https://facebook.github.io/react/) is mentioned in the package name, this package's only requirement is Redux. Feel free to use this with [AngularJS](https://angularjs.org/) and other libraries.

This is a fork of `react-chrome-redux` that allows to select subset of store to sync if you don't need all data from background in your child windows.

[![NPM Version][npm-image]][npm-url]
[![NPM Downloads][downloads-image]][downloads-url]

## Installation

This package is available on [npm](https://www.npmjs.com/package/react-chrome-redux-with-partials):

```
npm install react-chrome-redux-with-partials
```

## Overview

`react-chrome-redux-with-partials` allows you to build your Chrome extension like a Redux-powered webapp. The background page holds the Redux store, while Popovers and Content-Scripts act as UI Components, passing actions and state updates between themselves and the background store. At the end of the day, you have a single source of truth (your Redux store) that describes the entire state of your extension.

All UI Components follow the same basic flow:

1. UI Component dispatches action to a Proxy Store.
2. Proxy Store passes action to background script.
3. Redux Store on the background script updates its state and sends it back to UI Component.
4. UI Component is updated with updated state.

![Architecture](https://cloud.githubusercontent.com/assets/603426/18599404/329ca9ca-7c0d-11e6-9a02-5718a0fba8db.png)

## Basic Usage ([full docs here](https://github.com/tshaddix/react-chrome-redux/wiki))

As described in the [introduction](https://github.com/tshaddix/react-chrome-redux/wiki/Introduction#react-chrome-redux), there are two pieces to a basic implementation of this package.

### 1. Add the *Proxy Store* to a UI Component, such as a popup

```js
// popover.js

import React from 'react';
import {render} from 'react-dom';
import {Provider} from 'react-redux';
import {Store} from 'react-chrome-redux';

import App from './components/app/App';

const store = new Store({
  portName: 'MY_APP' // communication port name
});

// wait for the store to connect to the background page
store.ready().then(() => {
  // The store implements the same interface as Redux's store
  // so you can use tools like `react-redux` no problem!
  render(
    <Provider store={store}>
      <App/>
    </Provider>
    , document.getElementById('app'));
});
```

### Advanced. Add the *Proxy Store* to a UI Component, which would receive only custom selected data

```js
// popover.js

import React from 'react';
import {render} from 'react-dom';
import {Provider} from 'react-redux';
import {Store} from 'react-chrome-redux';

import App from './components/app/App';

const partialStore = new Store({
  portName: 'MY_APP', // communication port name
  key: 'firstPartOfState' // This should match keys used in `wrapStoreSelectors`
});

// wait for the store to connect to the background page
store.ready().then(() => {
  // The store implements the same interface as Redux's store
  // so you can use tools like `react-redux` no problem!
  render(
    <Provider store={partialStore}>
      <App/>
    </Provider>
    , document.getElementById('app'));
});
```

### 2. Wrap your Redux store in the background page with `wrapStore()`

```js
// background.js

import {wrapStore} from 'react-chrome-redux';

const store; // a normal Redux store

wrapStore(store, {portName: 'MY_APP'}); // make sure portName matches
```

That's it! The dispatches called from UI component will find their way to the background page no problem. The new state from your background page will make sure to find its way back to the UI components.

### Advanced. Wrap your Redux store selectors instead of whole store `wrapStoreSelectors()`

```js
// background.js

import {wrapStoreSelectors} from 'react-chrome-redux';

const store; // a normal Redux store

wrapStoreSelectors(store, {
    firstPartOfState: (state)=>{a: state.a, b: state.b},
    secondPartOfState: (state)=>{b: state.b, c: state.c},
}, {portName: 'MY_APP'}); // make sure portName matches
```

This will dispatch messages with only subset of data changed in selectors used. While wrapStoreSelectors already fires changes only when data changes, consider using `reselect` memoized selectors for complex data subsets

### 3. Optional: Implement actions whose logic only happens in the background script (we call them aliases)


Sometimes you'll want to make sure the logic of your action creators happen in the background script. In this case, you will want to create an alias so that the alias is proxied from the UI component and the action creator logic executes in the background script.

```js
// background.js

import { applyMiddleware, createStore } from 'redux';
import { alias, wrapStore } from 'react-chrome-redux';

const aliases = {
  // this key is the name of the action to proxy, the value is the action
  // creator that gets executed when the proxied action is received in the
  // background
  'user-clicked-alias': () => {
    // this call can only be made in the background script
    chrome.notifications.create(...);

  };
};

const store = createStore(rootReducer,
  applyMiddleware(
    alias(aliases)
  )
);
```

```js
// content.js

import { Component } from 'react';

const store = ...; // a proxy store

class ContentApp extends Component {
  render() {
    return (
      <input type="button" onClick={ this.dispatchClickedAlias.bind(this) } />
    );
  }

  dispatchClickedAlias() {
    store.dispatch({ type: 'user-clicked-alias' });
  }
}
```

### 4. Optional: Retrieve information about the initiator of the action

There are probably going to be times where you are going to want to know who sent you a message. For example, maybe you have a UI Component that lives in a tab and you want to have it send information to a store that is managed by the background script and you want your background script to know which tab sent the information to it. You can retrieve this information by using the `_sender` property of the action. Let's look at an example of what this would look like.

```js
// actions.js

export const MY_ACTION = 'MY_ACTION';

export function myAction(data) {
    return {
        type: MY_ACTION,
        data: data,
    };
}
```

```js
// reducer.js

import {MY_ACTION} from 'actions.js';

export function rootReducer(state = ..., action) {
    switch (action.type) {
    case MY_ACTION:
        return Object.assign({}, ...state, {
            lastTabId: action._sender.tab.id
        });
    default:
        return state;
    }
}
```

No changes are required to your actions, react-chrome-redux automatically adds this information for you when you use a wrapped store.

## Security

`react-chrome-redux` supports `onMessageExternal` which is fired when a message is sent from another extension, app, or website. By default, if `externally_connectable` is not declared in your extension's manifest, all extensions or apps will be able to send messages to your extension, but no websites will be able to. You can follow [this](https://developer.chrome.com/extensions/manifest/externally_connectable) to address your needs appropriately.

## Custom Serialization

You may wish to implement custom serialization and deserialization logic for communication between the background store and your proxy store(s). Chrome's message passing (which is used to implement this library) automatically serializes messages when they are sent and deserializes them when they are received. In the case that you have non-JSON-ifiable information in your Redux state, like a circular reference or a `Date` object, you will lose information between the background store and the proxy store(s). To manage this, both `wrapStore` and `Store` accept `serializer` and `deserializer` options. These should be functions that take a single parameter, the payload of a message, and return a serialized and deserialized form, respectively. The `serializer` function will be called every time a message is sent, and the `deserializer` function will be called every time a message is received. Note that, in addition to state updates, action creators being passed from your content script(s) to your background page will be serialized and deserialized as well.

### Example
For example, consider the following `state` in your background page:

```js
{todos: [
    {
      id: 1,
      text: 'Write a Chrome extension',
      created: new Date(2018, 0, 1)
    }
]}
```

With no custom serialization, the `state` in your proxy store will look like this:

```js
{todos: [
    {
      id: 1,
      text: 'Write a Chrome extension',
      created: {}
    }
]}
```

As you can see, Chrome's message passing has caused your date to disappear. You can pass a custom `serializer` and `deserializer` to both `wrapStore` and `Store` to make sure your dates get preserved:

```js
// background.js

import {wrapStore} from 'react-chrome-redux';

const store; // a normal Redux store

wrapStore(store, {
  portName: 'MY_APP',
  serializer: payload => JSON.stringify(payload, dateReplacer),
  deserializer: payload => JSON.parse(payload, dateReviver)
});
```

```js
// content.js

import {Store} from 'react-chrome-redux';

const store = new Store({
  portName: 'MY_APP',
  serializer: payload => JSON.stringify(payload, dateReplacer),
  deserializer: payload => JSON.parse(payload, dateReviver)
});
```

In this example, `dateReplacer` and `dateReviver` are a custom JSON [replacer](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/stringify) and [reviver](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/parse) function, respectively. They are defined as such:

```js
function dateReplacer (key, value) {
  // Put a custom flag on dates instead of relying on JSON's native
  // stringification, which would force us to use a regex on the other end
  return this[key] instanceof Date ? {"_RECOVER_DATE": this[key].getTime()} : value
};

function dateReviver (key, value) {
  // Look for the custom flag and revive the date
  return value && value["_RECOVER_DATE"] ? new Date(value["_RECOVER_DATE"]) : value
};

const stringified = JSON.stringify(state, dateReplacer)
//"{"todos":[{"id":1,"text":"Write a Chrome extension","created":{"_RECOVER_DATE":1514793600000}}]}"

JSON.parse(stringified, dateReviver)
// {todos: [{ id: 1, text: 'Write a Chrome extension', created: new Date(2018, 0, 1) }]}
```

## Docs

* [Introduction](https://github.com/tshaddix/react-chrome-redux/wiki/Introduction)
* [Getting Started](https://github.com/tshaddix/react-chrome-redux/wiki/Getting-Started)
* [Advanced Usage](https://github.com/tshaddix/react-chrome-redux/wiki/Advanced-Usage)
* [API](https://github.com/tshaddix/react-chrome-redux/wiki/API)
  * [Store](https://github.com/tshaddix/react-chrome-redux/wiki/Store)
  * [wrapStore](https://github.com/tshaddix/react-chrome-redux/wiki/wrapStore)
  * [alias](https://github.com/tshaddix/react-chrome-redux/wiki/alias)


[npm-image]: https://img.shields.io/npm/v/react-chrome-redux-with-partials.svg
[npm-url]: https://npmjs.org/package/react-chrome-redux-with-partials
[downloads-image]: https://img.shields.io/npm/dm/react-chrome-redux-with-partials.svg
[downloads-url]: https://npmjs.org/package/react-chrome-redux-with-partials
