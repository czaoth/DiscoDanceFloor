/**
 * Controls loading and playing all the visualization programs
 * from the programs folder.
 */

import * as fs from 'fs';
import * as path from 'path';

import { Inject, Injectable } from '@angular/core';
import { IProgram } from '../../../shared/program';
import { FloorBuilderService } from './floor-builder.service';

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

  private _runLoopTimer:NodeJS.Timer;

  constructor(@Inject(FloorBuilderService) private _floorBuilder:FloorBuilderService) {

  }
  
  /**
   * Create a promise that times out
   */
  private _promiseTimeout(milliseconds:number, promise:Promise<any>): Promise<any>{
    return new Promise<void>((resolve, reject) => {
      
      // Setup timeout
      var timeout = setTimeout(() => {
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
   * Load the list of programs from the programs folder.
   */
  loadPrograms() {
    this.programs = [];

    let dirPath = path.join(process.env.INIT_CWD, PROGRAM_DIR);
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
          try {
            this._promiseTimeout(PROGRAM_TIMEOUT, program.start(this._floorBuilder.cellList))
            .then(() => {
              this.isStarting = false;
              this.runningProgram = program;
              this.startRunLoop();
              resolve();
            })
            .catch((err) => {
              this.isStarting = false;
              reject(err);
            });
          } catch(e) {
            reject({ error: e.toString() })
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
    return new Promise<void>((resolve, reject) => {
      if (!this.runningProgram) {
        resolve();
        return;
      }

      // Shutdown
      this.isStopping = true;
      try {
        this.stopRunLoop();
        this._promiseTimeout(PROGRAM_TIMEOUT, this.runningProgram.shutdown())
        .then(resolve, reject)
        .then(finish.bind(this), finish.bind(this));
      } catch(e) {
        reject({ error: e.toString() })
      }
      
      function finish() {
        this.isStopping = false;
        this.runningProgram = null;
      }
    })
  }

  /**
   * Start the program run loop
   */
  private startRunLoop() {
    let lastLoopTime = (new Date()).getTime();

    this._runLoopTimer = setInterval(() => {
      try {
        let now = (new Date()).getTime(),
            timeDiff = now - lastLoopTime;

        if (!this.runningProgram) {
          this.stopRunLoop();
          return;
        }

        this.runningProgram.loop(timeDiff);
        lastLoopTime = now;
      } catch(e) {
        console.error(e);
      }
    }, RUN_LOOP_SPEED);
  }

  /**
   * Stop the program run loop
   */
  private stopRunLoop() {
    clearInterval(this._runLoopTimer);
  }
}