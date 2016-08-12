/**
 * Controls loading and playing all the visualization programs
 * from the programs folder.
 */

import * as fs from 'fs';
import * as path from 'path';

import { Subject } from 'rxjs/Subject';
import { Inject, Injectable } from '@angular/core';
import { IProgram } from '../../../shared/program';
import { FloorBuilderService } from './floor-builder.service';
import { StorageService } from './storage.service';

const PROGRAM_DIR = 'build/programs';

// timeout for program startup and shutdown
const PROGRAM_TIMEOUT = 5000;

// The number of milliseconds between run loop cycles
const RUN_LOOP_SPEED = 10;

@Injectable()
export class ProgramControllerService {

  programs:IProgram[] = [];
  runningProgram: IProgram;
  isStopping: boolean = false;
  isStarting: boolean = false;

  private _runningProgramSubject = new Subject<IProgram>();
  programObserver$ = this._runningProgramSubject.asObservable();

  private _playMode:('all'|'one') = 'one';
  private _shuffle:boolean = false;
  private _runningLoop:boolean = false;
  private _playTimer:NodeJS.Timer;

  constructor(
    @Inject(FloorBuilderService) private _floorBuilder:FloorBuilderService,
    @Inject(StorageService) private _storage:StorageService) {

    this._shuffle = this._storage.getItem("controller.shuffle") || false;
    this._playMode = (this._storage.getItem("controller.playAll")) ? 'all' : 'one';

    this.loadPrograms();
    this.startRunLoop();
  }
  
  /**
   * Create a promise that times out
   */
  private _promiseTimeout(milliseconds:number, promise:Promise<any>): Promise<any>{
    return new Promise<void>((resolve, reject) => {
      
      // Setup timeout
      let timeout = setTimeout(() => {
        reject({ error: 'timeout' });
      }, milliseconds);
      function cancelTimeout() {
        clearTimeout(timeout);
      }
      
      // Run promise
      promise
      .then(cancelTimeout)
      .then(resolve, reject);
      
    });
  }

  /**
   * Get the index of the currently running program in the program list
   * 
   * @return {number} The index number or -1
   */
  _getRunningProgramIndex():number {
    let idx = -1;
    if (this.runningProgram) {
      idx = this.programs.indexOf(this.runningProgram);
    }
    return idx;
  }

  /**
   * Load the list of programs from the programs folder.
   */
  loadPrograms() {
    if (this.programs.length) {
      return this.programs;
    }

    this.programs = [];

    try {
      let dirPath = path.join(__dirname, '../../../../', PROGRAM_DIR);
      fs.readdirSync(dirPath).forEach(file => {

        // Not a javascript file
        if (!file.match(/^[^\.].*?\.js$/)) return;

        try {
          let prog = require(path.join(dirPath, file));
          prog.file = file;
          this.programs.push(prog);
        } catch(e) {
          process.stderr.write(e.message);
          process.stderr.write(e.stack);
        }
      });
    } catch(e) {
      console.error('Could not read program list', e);
    }

    // Filter out disabled programs
    this.programs = this.programs.filter((p) => p.info.disabled !== true );

    return this.programs;
  }

  /**
   * Get a program by name
   *
   * @param {String} name The name of the program to fetch
   *
   * @return {IProgram}
   */
  getProgramByName(name: String) {
    name = name.toLocaleLowerCase();
    return this.programs.find( p => {
      return (p.info.name.toLowerCase() === name);
    });

  }

  /**
   * Start playing a program (stop the existing program, if one was running)
   *
   * @param {String} name The name of the program to run.
   *
   * @return {Promise} resolves when the program is started and running.
   */
  runProgram(program: IProgram): Promise<void> {
    let cellList = this._floorBuilder.cellList;
    if (program) {
      return new Promise<void>( (resolve, reject) => {

        // Stop running program before starting the new one 
        try {
          this.stopProgram()
          .then(start.bind(this), start.bind(this));
        } catch(e) {
          reject(e);
        }
        
        // Start program
        function start() {
          this.isStarting = true;
          this._runningProgramSubject.next(program);

          try {
            this._promiseTimeout(PROGRAM_TIMEOUT, program.start(cellList))
            .then(() => {
              finishStartup.bind(this)();
              this.runningProgram = program;
              resolve();
            })
            .catch((err) => {
              startError.bind(this)(err);
            });
            
          } catch(e) {
            startError.bind(this)({ error: e.toString() });
          }
        }
        
        // Finish the program startup tasks
        function finishStartup() {
          this.isStarting = false;
          cellList.clearFadePromises();
          cellList.updateColor();
          this.startPlayTimer(program);
        }

        // An error occured trying to start the program
        function startError(err) {
          this._runningProgramSubject.error(err);
          finishStartup.bind(this)();
          reject(err);

          // Try to start another program
          if (this._playMode === 'all') {
            this.playNext();
          }
        }
      });
    }
    return Promise.reject({ error: "Could not find program" });
  }

  /**
   * Stop the running program
   *
   * @return {Promise} resolves when the program has been shutdown
   */
  stopProgram(): Promise<void> {
    let cellList = this._floorBuilder.cellList;
    
    return new Promise<void>((resolve, reject) => {
      if (!this.runningProgram) {
        resolve();
        return;
      }

      this.stopPlayTimer();

      // Shutdown
      this.isStopping = true;
      try {
        let shutdown = this._promiseTimeout(PROGRAM_TIMEOUT, this.runningProgram.shutdown());
        shutdown.then(finish.bind(this), finish.bind(this));
        shutdown.then(resolve, reject);
      } catch(e) {
        finish();
        reject({ error: e.toString() })
      }
      
      function finish() {
        this.isStopping = false;
        this.runningProgram = null;
        this._runningProgramSubject.next(this.runningProgram);
        cellList.clearFadePromises();
      }
    })
  }

  /**
   * Start the program run loop which calls the `loop` method
   * of the running program and updates the colors on fading cells.
   */
  startRunLoop() {
    let lastLoopTime = (new Date()).getTime();

    let runLoop = (function() {
      if (!this._runningLoop) {
        return;
      }
      try {
        let now = (new Date()).getTime(),
            timeDiff = now - lastLoopTime;
            
        // Call running program's loop method
        if (this.runningProgram) {
          try {
            this.runningProgram.loop(timeDiff);
          } catch(e) {
            console.error(e);
          }
        }
        
        // Update cell fading
        this._floorBuilder.cellList.updateColor();
        
        if (timeDiff > 0) {
          lastLoopTime = now;
        }
        
      } catch(e) {
        console.error(e);
      }
      
      window.requestAnimationFrame(runLoop);
    }).bind(this);
    
    this._runningLoop = true;
    runLoop();
  }

  /**
   * Stop the program run loop
   */
  stopRunLoop(): void {
    this._runningLoop = false;
  }

  /**
   * If we're in play "all" mode, start a timer for the current program.
   * After the timer is done, the next program will play.
   */
  startPlayTimer(program:IProgram): void {
    this.stopPlayTimer();

    // Only for play 'all' mode
    if (this._playMode !== 'all') {
      return;
    }
    
    // Determine minimum playtime in milliseconds 
    // (default units from program info are seconds)
    let minPlayTime = program.info.miniumumTime || 1;
    if (minPlayTime < 1000) {
      minPlayTime *= (1000 * 60); 
    }

    // Play next, after minimum time has elapsed
    this._playTimer = setTimeout(() => {
      if (this._playMode === 'all') {
        this.playNext();
      }
    }, minPlayTime);
  }

  /**
   * Stop the current play timer
   * (@see startPlayTimer)
   */
  stopPlayTimer(): void {
    clearTimeout(this._playTimer);
  }

  /**
   * Set play mode:
   *    + 'all': Play all programs in the program list
   *    + 'one': Continue playing the current program
   * 
   * @param {String} mode Either 'all' or 'one'
   */
  setPlayMode(mode:('all'|'one')): void {
    let oldMode = this._playMode;
    this._playMode = mode;

    // Mode change
    if (oldMode !== mode) {
      if (mode === 'all') {
        this.startPlayTimer(this.runningProgram);
      }
      else {
        this.stopPlayTimer();
      }
    }
  }

  /**
   * Set shuffle mode: true: shuffle, false: in order
   * 
   * @param {boolean} shuffle Set to `true` to enable shuffling programs.
   */
  setShuffle(shuffle:boolean): void {
    this._shuffle = shuffle;
  }

  /**
   * Play the next program in the list (or a random program if we're on suffle mode)
   */
  playNext(): void {
    if (this.isStarting || this.isStopping) {
      return;
    }
    if (!this.programs.length) {
      return;
    }

    // Play a random program
    if (this._shuffle) {
      this.playRandom(this.runningProgram);
      return;
    }

    // Get index of next program
    let idx = this._getRunningProgramIndex();
    if (idx < 0 || idx >= this.programs.length - 1) {
      idx = 0;
    }
    else {
      idx++;
    }

    this.runProgram(this.programs[idx]);
  }

  /**
   * Play the previous program in the list.
   */
  playPrevious(): void {
    if (this.isStarting || this.isStopping) {
      return;
    }
    if (!this.programs.length) {
      return;
    }

    // Play a random program
    if (this._shuffle) {
      this.playRandom(this.runningProgram);
      return;
    }

    // Get index of previous program
    let idx = this._getRunningProgramIndex() - 1;
    if (idx < 0) {
      idx = this.programs.length - 1;
    }

    this.runProgram(this.programs[idx]);
  }

  /**
   * Play a random program.
   * 
   * @param {IProgram} not (optional) Exclude this program from the selection
   */
  playRandom(not:IProgram = null): void {
    let selected:IProgram,
        max:number = this.programs.length - 1;

    if (this.isStarting || this.isStopping) {
      return;
    }

    if (this.programs.length === 0) {
      return;
    }

    // If only one program, play it
    if (this.programs.length === 0) {
      this.runProgram(this.programs[0]);
      return;
    }

    // Choose random program
    do {
      let idx = Math.floor(Math.random() * (max + 1));
      selected = this.programs[idx];
    } while(!selected || (not != null && selected.file == not.file));

    // Play
    this.runProgram(selected);
  }

}