import { IProgram, Program } from '../shared/program';
import { FloorCellList } from '../shared/floor-cell-list';

@Program({
  name: 'Audio Bars',
  description: 'An audio visualization that displays the audio levels as bars.',
  interactive: false,
  miniumumTime: 1
})
class AudioBars implements IProgram {
  floorCellList:FloorCellList;

  /**
   * Start the program
   */
  start(cellList: FloorCellList): Promise<void> {
    this.floorCellList = cellList;
    return Promise.resolve();
  }

  /**
   * Shutdown the program
   */
  shutdown(): Promise<void> {
    return Promise.resolve();
  }

  /**
   * Floor run loop
   */
  loop(time:number): void {
  }
}

module.exports = new AudioBars();

// var audio = require('../lib/audio.js');

// var floorController,
//     timer1, timer2,
//     running = false,
//     color1 = [255, 0, 0],
//     color1Select = 0,
//     color2 = [0, 127, 255],
//     color2Select = 2,
//     colorChangeTime = 4000;

// module.exports = {

//   info: {
//     name: 'Audio Bars',
//     description: 'Audio bars visualization',
//     interactive: false,
//     audio: true,
//     miniumumTime: 1
//   },

//   /**
//     Setup the program
//   */
//   init: function(controller){
//     floorController = controller;
//     return Promise.resolve();
//   },

//   /**
//     Shutdown this program and clear memory
//   */
//   shutdown: function(){
//     running = false;
//     window.clearInterval(timer1);
//     window.clearInterval(timer2);
//     return floorController.changeAllCells([0,0,0], 300);
//   },

//   /**
//     Run the program
//   */
//   run: function(){
//     var x = floorController.getDimensions().x;

//     // Determine fft size by width of floor
//     audio.analyser.fftSize = 32;
//     while (audio.analyser.fftSize < x) {
//       audio.analyser.fftSize *= 2;
//     }

//     running = true;
//     visualizeAudio();

//     // Update colors over time
//     (function() {
//       var colorChangeNum = 0;
//       timer1 = setInterval(function(){
//         colorChangeNum++;
//         color1 = [0,0,0];
//         color2 = [0,0,0];

//         // Simple cross fade between color changes
//         // primary & secondary are on opposite phases
//         if (colorChangeNum % 2 !== 0) {
//           color2[color2Select] = 255;

//           // Crossfade primary color
//           color1[color1Select] = 127;
//           color1Select++;
//           if (color1Select > 2) color1Select = 0;
//           color1[color1Select] = 255;
//         } else {
//           color1[color1Select] = 255;

//           // Crossfade secondary color
//           color2[color2Select] = 127;
//           color2Select++;
//           if (color2Select > 2) color2Select = 0;
//           color2[color2Select] = 255;
//         }

//       }, colorChangeTime);
//     })();
//   }
// };

// /**
//   Get processed audio data and visualize it on the floor
// */
// function visualizeAudio() {
//   var dimensions = floorController.getDimensions(),
//       allData = new Uint8Array(audio.analyser.frequencyBinCount),
//       data = new Uint8Array(dimensions.x),
//       scale = dimensions.y / 255,
//       height, cell, chunking, percent,
//       primaryColor = color1.slice(0),
//       secondaryColor = color2.slice(0);

//   if (!running) {
//     return;
//   }

//   audio.analyser.getByteFrequencyData(allData);

//   // Equally divide data up into our x axis
//   if (allData.length > dimensions.x) {
//     chunking = Math.floor(allData.length / dimensions.x);
//     for (var i = 0, n = 0; i < allData.length; i += chunking) {
//       data[n++] = allData[i];
//     }
//   }

//   // Set secondary color
//   for (var c = 0; c < 3; c++) {
//     secondaryColor[c] = Math.round(secondaryColor[c] * (data[3] / 255));
//   }

//   // Create bars along the x axis that display the audio  bands
//   for (var x = 0, xLen = dimensions.x; x < xLen; x++) {
//     percent = data[x] / 255; // percent of the max value
//     height = Math.round(data[x] * scale);

//     // Set the color as a percentage of the audio value
//     for (var i = 0; i < 3; i++) {
//       primaryColor[i] = Math.round(primaryColor[i] * percent);
//     }

//     if (height > dimensions.y) {
//       height = dimensions.y;
//     }
//     if (primaryColor[color1Select] < 50) {
//       primaryColor[color1Select] = 50;
//     }

//     for (var y = 0, yLen = dimensions.y; y < yLen; y++) {
//       cell = floorController.getCell(x, y);

//       if (!cell) continue;
//       if (y <= height) {
//         cell.setColor(primaryColor);
//         // cell.fadeToColor(primaryColor, 50);
//       } else {
//         cell.setColor(secondaryColor);
//         // cell.fadeToColor(secondaryColor, 50);
//       }
//     }
//   }

//   window.requestAnimationFrame(visualizeAudio);
// }