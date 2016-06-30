/**
 * Used to connect to the DiscoDongle serial
 * interface used to communicate with the dance floor.
 * 
 * Example usage:
 * -------------
 * ```
 * import { CommunicationService } from './serial-connect.service';
 * 
 * let comm = new CommunicationServices();
 * 
 * // Get device list
 * comm.getDevices().then( ... );
 * 
 * // Connect
 * comm.connect('/dev/cu.usbserial-AL028X9K').then( ... );
 * 
 * // Write data
 * comm.port.write(['h', 'i']);
 * 
 * ```
 */

import { Inject, Injectable } from '@angular/core';
import { Observable, Observer } from 'rxjs';

import { FloorCell } from '../../../shared/floor-cell';
import { BusProtocolService, CMD } from './bus-protocol.service';
import { FloorBuilderService } from './floor-builder.service';

const BAUD_RATE    = 9600; //250000;
const RUN_DELAY    = 1000; // Time between run iterations
const SENSOR_DELAY = 2000; // How long to let the sensor check

@Injectable()
export class CommunicationService {

  port: any;

  private _serialPortLib:any;
  private _running:boolean = false;
  private _runIteration:number = 0;
  private _sensorSelect:number = 1;
  
  bus:BusProtocolService;

  constructor(
    @Inject(FloorBuilderService) private _floorBuilder:FloorBuilderService) {
    this.bus = new BusProtocolService(this);

    this._floorBuilder.setComm(this);

    // Must be done here, otherwise the UI breaks.
    this._serialPortLib = require('serialport');
  }

  /**
   * Get the list of serial devices connected
   * to the computer
   * 
   * @return {Promise} A promise to an array of device paths
   */
  getDevices(): Promise<string[]> {
    return new Promise<string[]> ( (resolve, reject) => {

      this._serialPortLib.list( (err, ports) => {
        if (err) {
          reject(err);
          return;
        }

        let paths = ports.map( p => {
          return p.comName;
        });
        resolve(paths);
      });
    });
  }

  /**
   * Are we currently connected to a device
   */
  isConnected(): boolean {
    return (this.port && this.port.isOpen());
  }

  /**
   * Connect to a serial device.
   * 
   * @param {String} device The path to the device.
   * 
   * @return {Promise}
   */
  connect(device:string): Promise<void> {
    this._running = false;

    return new Promise<void> ( (resolve, reject) => {
      
      // Disconnect, if we're currently connected
      if (this.isConnected()) {
        this.disconnect().then(conn);
      }
      else {
        conn.bind(this)();
      }

      function conn() {
        this.port = new this._serialPortLib.SerialPort(device, {
          baudRate: BAUD_RATE
        }, 
        (err) => { // Connect callback
          if (err){ 
            console.error(err);
            reject(err);
          } else {
            resolve();
            this.bus.connect();
          } 
        });
      }
      
    });
  }

  /**
   * Disconnect from the serial device.
   * 
   * @return {Promise}
   */
  disconnect(): Promise<void> {
    return new Promise<void> ( (resolve, reject) => {
      if (!this.port || !this.port.isOpen()) {
        resolve();
        return;
      }

      this._running = false;
      this.port.close( err => {
        if (err) {
          console.error(err);
          reject(err);
        } else {
          resolve();
        }
      });

    });
  }

  /**
   * Change the status of the outgoing daisy line.
   * 
   * @param {boolean} enabled Set to true to enable the outgoing daisy line.
   */
  setDaisy(enabled): Promise<void> {
    return new Promise<void> ( (resolve, reject) => {
      if (!this.port) {
        reject('There is no open connection');
      }

      this.port.set({rts:enabled, dtr:enabled}, err => {
        if (err) {
          console.error(err);
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Run looping communications with the floor.
   *  1. Send floor colors to all nodes.
   *  2. Request nodes check their touch sensors.
   *  3. (short delay)
   *  4. Request sensor data.
   *  5. continue from step 1
   * 
   * @param {boolean} addressing Start the communications by dynamically addressing all floor nodes.
   */
  run(): void {
    if (this._running) return;
    this._running = true;
    this._runIteration = 0;
    this._runIterator();
  }

  /**
   * Dynamically address all floor cells.
   * 
   * This starts by sending a reset message, so all nodes reset their addresses.
   * Then it sends out an addressing message. 
   * After that returns, it does one more addressing message to pickup any nodes that didn't respond the first time around.
   */
  assignAddresses(): Observable<number>{
    let source = Observable.create( (observer:Observer<number>) => {
      let addressTimes = 0;
      let nodeNum = 0;

      // Reset nodes
      this.bus.startMessage(CMD.RESET, 0);
      this.bus.endMessage().subscribe(
        null,
        (err) => observer.error,
        () => {
          setTimeout(addrNodes.bind(this), 500);
        }
      );

      // Address all nodes
      function addrNodes() {
        addressTimes++;

        this.bus.startAddressing(nodeNum)
        .subscribe(
          (n) => observer.next(n),

          // Error
          (err) => {
            console.error(err);

            // Try again
            if (addressTimes === 1) {
              setTimeout(addrNodes.bind(this), 500);
            }
            else {
              observer.error(err)
            }
          },

          // Complete
          () => {
            // See if there are any straglers
            if (addressTimes === 1) {
              nodeNum = this.bus.nodeNum;
              setTimeout(addrNodes.bind(this), 500);
            }
            // All done
            else {
              observer.complete();
            }
          }
        );
      }
    });

    let observable = source.publish();
    observable.connect();
    return observable;
  }

  /**
   * The run loop iterator, that is called continously to communicate with the dance floor.
   * See `run()` for more information.
   */
  private _runIterator(): void {
    if (!this._running) return;

    console.log('Run iterator');

    let subject:Observable<any>;
    let nextDelay = RUN_DELAY;

    switch (this._runIteration) {
      case 0: // Colors
        subject = this._sendColors();
        break;
      case 1: // Run sensors
        subject = this._runSensors();
        nextDelay = SENSOR_DELAY;
        break;
      // case 2: // Get sensor data
      //   subject = this._readSensorData();
      //   break;
      
      // Loop back to the start
      default:
        this._runIteration = 0;
        this._runIterator();
    };

    let runNext = function() {
      this._runIteration++;
      console.log('Run again in', nextDelay);
      setTimeout(this._runIterator.bind(this), nextDelay);
    }.bind(this);

    if (!subject) {
      runNext();
    }
    else {
      subject.subscribe(
        null,
        (err) => {
          console.error(err);
          runNext();
        },
        () => {
          runNext();  
        }
      );
    }
  }

  /**
   * Send RGB colors to all cells
   */
  private _sendColors(): Observable<any> {
    this.bus.startMessage(CMD.SET_COLOR, 3, { batchMode: true });

    for (let i = 0; i < this.bus.nodeNum; i++) {
      let node:FloorCell = this._floorBuilder.cellList.atIndex(i);
      let color = [0, 0, 0];
      if (node) {
        color = node.color;
      }
      this.bus.sendData(color);
    }

    return this.bus.endMessage();
  }

  /**
   * Ask all nodes to check their touch sensors.
   */
  private _runSensors(): Observable<any> {
    this.bus.startMessage(CMD.RUN_SENSOR, 1, { batchMode: true });

    // Only have half the cells checking their sensors at a time
    let even = (this._sensorSelect > 0);
    for (let i = 0; i < this.bus.nodeNum; i++) {
      let val = (i % 2 == 0 && even) ? 1 : 0;
      this.bus.sendData(val);
    }
    this._sensorSelect *= -1;

    return this.bus.endMessage();
  }

  /**
   * Get the sensor data from all nodes
   */
  private _readSensorData(): Observable<any> {
    var subject = this.bus.startMessage(CMD.GET_SENSOR_VALUE, 1, { 
      batchMode: true, 
      responseMsg: true,
      responseDefault: [-1] 
    });
    return subject;
  }
}
