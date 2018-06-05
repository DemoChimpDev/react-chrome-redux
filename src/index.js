import Store, { applyMiddleware } from './store/Store';
import wrapStore from './wrap-store/wrapStore';
import {wrapStoreSelectors} from './wrap-store/wrapStore';
import alias from './alias/alias';

export {Store, applyMiddleware, wrapStore, alias, wrapStoreSelectors};