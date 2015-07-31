'use strict';

/* global process */

var disco = require('./lib/disco_controller.js'),
    utils = require('./lib/utils.js');

(function() {
  var fadeProcessing = false;

  $(document).ready(function(){
    var dimensions = disco.controller.getDimensions();

    // Set floor dimensions
    $('#floor-max-x').val(dimensions.x);
    $('#floor-max-y').val(dimensions.y);

    // User updated floor dimensions
    $('.dimensions input').keyup(function(){
      var x = parseInt($('#floor-max-x').val() ),
        y = parseInt($('#floor-max-y').val() );

      if (!isNaN(x) && !isNaN(y)) {
        disco.controller.setDimensions(x, y);
      }
    });

    // Step on/off floor cells
    $('table.grid').mousedown(function(evt){
      if (evt.target.nodeName != 'TD') return;

      var td = $(evt.target),
        x = parseInt(td.attr('data-x')),
        y = parseInt(td.attr('data-y')),
        cell = disco.controller.getCell(x, y);

      cell.setValue(1);
    });
    $('table.grid').mouseup(function(evt){
      if (evt.target.nodeName != 'TD') return;

      var td = $(evt.target),
        x = parseInt(td.attr('data-x')),
        y = parseInt(td.attr('data-y')),
        cell = disco.controller.getCell(x, y);

      cell.setValue(0);
    });


    buildFloor(dimensions.x, dimensions.y);
  });
  window.onresize = sizeTable;

  /**
    Build floor grid
  */
  function buildFloor(xMax, yMax) {
    var emulator = $('.emulator'),
      table = emulator.find('table.grid'),
      tbody = document.createElement('tbody'),
      tr, td;

    table.empty();

    // Create rows and cells
    for (var y = 0; y < yMax; y++) {
      tr = document.createElement('tr');
      for (var x = 0; x < xMax; x++) {
        td = document.createElement('td');
        td.id = 'cell-'+ x +'-'+ y;
        td.setAttribute('data-x', x);
        td.setAttribute('data-y', y);
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }

    table.append(tbody);
    process.nextTick(sizeTable);
  }

  /**
    Size the table to keep the floor cells square in the available space
  */
  function sizeTable() {
    var emulator = $('.emulator'),
        table = emulator.find('.grid'),
        dimensions = disco.controller.getDimensions(),
        xMax = dimensions.x,
        yMax = dimensions.y;

    table.css({
      'height': '100%',
      'width': '100%',
    });

    if (xMax < yMax) {
      table.css('width', table.outerHeight());
    }
    else if (xMax > yMax) {
      table.css('height', table.outerWidth());
    }
  }

  // Update floor grid
  disco.controller.events.on('dimensions.changed', function(xMax, yMax){
    buildFloor(xMax, yMax);
  });

  // Start stop fade processing
  disco.controller.events.on('fadeFrame.start', function(){
    fadeProcessing = true;
  });
  disco.controller.events.on('fadeFrame.end', function(){
    fadeProcessing = false;
    // window.requestAnimationFrame(updateFrame);
  });

  // Floor cell color changed
  disco.controller.events.on('cell.colorChanged', function emulatorSetColor(x, y, color){
    var el = document.getElementById('cell-'+ x +'-'+ y);
    if (!el) {
      return;
    }

    // Set color
    el.style.background = 'rgb('+ color.join(',') +')';
  });

  // Fading color change
  disco.controller.events.on('cell.fadeStart', function emulatorSetColor(x, y, color, duration){
    var el = document.getElementById('cell-'+ x +'-'+ y);
    if (!el) {
      return;
    }

    color = 'rgb('+ color.join(',') +')';
    $(el).animate({backgroundColor: color}, duration, function(){
        // If truly emulating the floor, call stopFade when done
        var cell;
        if (disco.emulatedFloor) {
          cell = disco.controller.getCell(x, y);
          if (cell) {
            cell.stopFade();
          }
        }
      });
  });
})();
