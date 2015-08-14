/**
  Floor cell object
  @private

  @class FloorCell
  @param {int} xPos The x coordinate position of this cell on the floor
  @param {int} yPos The y coordinate position of this cell on the floor
  @param {FloorController} discoController The floor controller this cell belongs to
*/

'use strict';

var Promise  = require("bluebird"),
    events     = require('events'),
    discoUtils = require('./utils.js');

function FloorCell (xPos, yPos, controller) {

  if (!controller) {
    controller = require('./disco_controller.js').controller;
  }

  this.MODE_NORMAL = 0;
  this.MODE_FADING = 1;

  var x = xPos,
      y = yPos,
      mode = 0,
      value = 0,
      color = [0,0,0],
      targetColor = [0,0,0],
      fadingColor = [0,0,0],
      fadeDuration = 0,
      fadeIncrements = [0, 0, 0],
      fadePromise = null,
      lastFadeUpdate = 0;

  /**
    Events emitted are:

    * colorChanged: The color of this cell has changed
    * fadeStart: A color fade has being
    * fadeEnd: The fade has completed
    * valueChanged: The cells step value has changed

    @property events
    @type EventEmitter
  */
  this.events = new events.EventEmitter();

  /**
    Set the cells x/y position on the floor

    @method setXY
    @params {int} xPos
    @params {int} yPos
  */
  this.setXY = function(xPos, yPos) {
    x = xPos;
    y = yPos;
  };

  /**
    True if the floor is currently fading

    @method isFading
    @return boolean
  */
  this.isFading = function() {
    return mode == FloorCell.MODE_FADING;
  };

  /**
    Get the x position of this cell

    @method getX
    @return int
  */
  this.getX = function() {
    return x;
  };

  /**
    Get the y position of this cell

    @method getY
    @return int
  */
  this.getY = function() {
    return y;
  };

  /**
    Set the color of this cell

    @method setColor
    @param {Array or String} rgb Color defined as an RGB array or HEX string
    @param {boolean} stopFade (optional) If currently fading, set this to `false` to not stop the current fade.
                              Otherwise, the fade will continue from this color
                              Deaults to 'true'
  */
  this.setColor = function(rgb, stopFade) {
    if (typeof rgb == 'string') {
      rgb = discoUtils.hexToRGB(rgb);
    }

    // Stop the current fade
    if (stopFade !== false && mode == FloorCell.MODE_FADING) {
      targetColor = rgb;
      return this.stopFade();
    }

    color = rgb;
    this.events.emit('colorChanged', color);
    controller.events.emit('cell.colorChanged', x, y, color);

    return color.slice(0);
  };

  /**
    Get the current color of the cell

    @method getColor
    @return {Array} RGB color array
  */
  this.getColor = function() {
    return color.slice(0);
  };

  /**
    Set the cell to fade to a color

    @method fadeToColor
    @param {Array or String} color The color to fade to. Either an RGB array or string HEX code
    @param {int} duration The time, in milliseconds, it should take to fade to the color

    @return {Promise} which will resolve when the fade is complete
  */
  this.fadeToColor = function(toColor, duration) {
    if (typeof toColor == 'string') {
      toColor = discoUtils.hexToRGB(toColor);
    }

    // Figure out how much to change the color per millisecond
    fadeIncrements = [0, 0, 0];
    for (var i = 0; i < 3; i++) {
      var colorDiff = toColor[i] - color[i];

      if (colorDiff === 0) {
        fadeIncrements[i] = 0;
      } else {
        fadeIncrements[i] = colorDiff / duration;
      }
    }

    mode = FloorCell.MODE_FADING;
    targetColor = toColor;
    fadingColor = color.slice(0);
    fadeDuration = duration;
    lastFadeUpdate = 0; // set this to zero, so that all LEDs can be in sync when time is passed to processFadeIncrement

    // Events
    this.events.emit('fadeStart', targetColor, duration);
    controller.events.emit('cell.fadeStart', x, y, targetColor, duration);

    fadePromise = Promise.pending();
    return fadePromise.promise;
  };

  /**
    Figure out the current color in the fade progression

    @method processFadeIncrement
    @param {int} time (optional) The current timestamp
    @return {Array} color
  */
  this.processFadeIncrement = function(time) {
    if (!this.isFading()) return this.getColor();
    time = time || Date.now();

    var inc = 0,
        fading = true,
        updateColor = color.slice(0),
        timeSince;

    // Officially start fade now
    if (lastFadeUpdate === 0) {
      lastFadeUpdate = time;
    }

    timeSince = time - lastFadeUpdate;
    for (var i = 0; i < 3; i++) {
      inc = fadeIncrements[i];
      if (inc !== 0) {
        fadingColor[i] += inc * timeSince;

        // Fade complete
        if ((inc > 0 && fadingColor[i] >= targetColor[i]) ||
            (inc < 0 && fadingColor[i] <= targetColor[i])) {
          fadingColor[i] = targetColor[i];
          fadeIncrements[i] = 0;
        }
        else {
          fading = true;
        }

        updateColor[i] = Math.round(fadingColor[i]);
      }
    }
    lastFadeUpdate = time;
    fadeDuration -= timeSince;

    // Update color
    if (!fading || fadeDuration <= 0) {
      this.stopFade();
    }
    return this.setColor(updateColor, false);
  };

  /**
    Get the color we're fading to

    @method getFadeColor
    @return {Array} RGB color array
  */
  this.getFadeColor = function(){
    return targetColor.slice(0);
  };

  /**
    Get the duration of the current fade

    @method getFadeDuration
    @return int
  */
  this.getFadeDuration = function(){
    return fadeDuration;
  };

  /**
    Set a new duration for the current fade

    @method setFadeDuration
    @param {int} duration The new fade duration from this moment until the end of th fade
  */
  this.setFadeDuration = function(duration) {
    fadeDuration = duration;
  };

  /**
    Stop the current fade

    @method stopFade
  */
  this.stopFade = function() {
    this.setColor(targetColor, false);
    fadeDuration = 0;
    mode = FloorCell.MODE_NORMAL;

    if (fadePromise) {
      fadePromise.resolve();
    }

    this.events.emit('fadeEnd');
    controller.events.emit('cell.fadeEnd', x, y);
  };

  /**
    Return the promise object for the current fade operation

    @method getFadePromise
    @returns Promise
  */
  this.getFadePromise = function() {
    if (mode == FloorCell.MODE_NORMAL) {
      return fadePromise.promise;
    }
    return null;
  };

  /**
    Set the binary step value of the floor cell:
    * 0: Not stepped on
    * 1: Stepped on

    @method setValue
    @param {val} int The step value
  */
  this.setValue = function(val){
    if (val != value) {
      value = val;
      this.events.emit('valueChanged', val);
      controller.events.emit('cell.valueChanged', x, y, val);
    }
  };

  /**
    Get the step value of the floor cell

    @method getValue
    @return {int} 0: not stepped on, 1: stepped on
  */
  this.getValue = function(){
    return value;
  };

}

module.exports = FloorCell;
