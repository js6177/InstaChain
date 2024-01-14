//export var callbacksMap = new Map()

var UiControllerMap = new Map();

export function getUiControllerCallbacks() {
  return UiControllerMap;
}

export function setUiControllerCallbacks(callbacks) {
  UiControllerMap = callbacks;
}