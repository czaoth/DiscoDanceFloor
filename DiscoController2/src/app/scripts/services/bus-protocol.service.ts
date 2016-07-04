/**
 * Communicates with the floor as a master node using the Multi-drop 
 * Bus Protocol defined here:
 * https://github.com/jgillick/AVR-Libs/tree/master/MultidropBusProtocol
 * 
 * This class sends messages, processes responses and coordinates dynamic
 * addressing. 
 */

import { Observable, Observer, ConnectableObservable } from 'rxjs';
import { CommunicationService } from './communication.service';

const BROADCAST_ADDRESS = 0;
const RESPONSE_TIMEOUT = 50;
const MAX_ADDRESS_CORRECTIONS = 10;

// Commands
export const CMD = {
  RESET:            0xFA,
  ADDRESS:          0xFB,
  NULL:             0xFF,

  SET_COLOR:        0xA1,
  RUN_SENSOR:       0xA2,
  GET_SENSOR_VALUE: 0xA3
};

// Message flags
const BATCH_MODE   = 0b00000001;
const RESPONSE_MSG = 0b00000010;

/**
 * Bus protocol service class
 */
export class BusProtocolService {

  private _crc:number;
  private _dataLen:number;
  private _fullDataLen:number;
  private _sentLen:number;
  private _responseDefault:number[];
  private _responseTimer:any = null;
  private _responseCount:number;
  private _promiseResolvers:Function[];
  private _msgOptions:any;

  private _messageObserver:Observer<number>;
  private _addressCorrections:number = 0;
  private _addressing:boolean = false;

  nodeNum:number = 0;
  msgSubscription:ConnectableObservable<number>;
  msgResponse:any;

  constructor(private _serial:CommunicationService) {
  }

  /**
   * Connect the serial connection to the bus protocol
   */
  connect() {
    // Handle new data received on the bus
    this._serial.port.on('data', d => {
      this._handleData(d);
    });
    
    // Disable daisy line when the port opens
    this._serial.port.on('open', d => {
      this._serial.setDaisy(false);
    });
  }
  

  /**
   * Start a new message
   */
  startMessage(
    command:number,
    length:number,
    options:{
      batchMode?:boolean,
      responseMsg?:boolean,
      destination?:number,
      responseDefault?:number[]
    }={}): Observable<number> {
    this.msgResponse = [];

    let data = [];

    this._msgOptions = options;
    this._dataLen = length;
    this._fullDataLen = this._dataLen;
    this._responseCount = 0;
    this._sentLen = 0;
    this._crc = 0xFFFF;
    this._promiseResolvers = [];

    // Fill in default response
    if (options.responseMsg) {
      if (!options.responseDefault) {
        options.responseDefault = [];
      }
      options.responseDefault.splice(this._dataLen); // cut down to size

      // Fill rest of array with zeros
      if (options.responseDefault.length < this._dataLen) {
        let start = options.responseDefault.length;
        let end = this._dataLen - 1;
        options.responseDefault[end] = 0;
        options.responseDefault.fill(start, end, 0);
      }
    }

    let flags = 0;
    if (options.batchMode) {
      flags |= BATCH_MODE;
    }
    if (options.responseMsg) {
      flags |= RESPONSE_MSG;
    }

    if (typeof options.destination === 'undefined') {
      options.destination = BROADCAST_ADDRESS;
    }

    // Header
    data = [
      0xFF,
      0xFF,
      flags,
      options.destination,
      command
    ];

    // Length
    if (options.batchMode) {
      data.push(this.nodeNum);
      this._fullDataLen = length * this.nodeNum;
    }
    data.push(length);

    // Send
    this._sendBytes(data);

    // Message observer
    return this._createMessageObserver();
  }

  /**
   * Start dynamically addressing all nodes
   * 
   * @param {number} startFrom (optional) The address to start from.
   * 
   * @return {Promise}
   */
  startAddressing(startFrom:number=0): Observable<number> {
    this.nodeNum = startFrom;
    this.msgResponse = [];

    this._msgOptions = {};
    this._sentLen = 0;
    this._dataLen = 0;
    this._fullDataLen = 0;
    this._addressing = true;
    this._addressCorrections = 0;
    this._promiseResolvers = [];

    this._serial.setDaisy(false);
    
    // Start address message
    this.startMessage(CMD.ADDRESS, 2, { batchMode: true, responseMsg: true });

    // Set daisy and send first address
    this._serial.port.drain(() => {
      this._serial.setDaisy(true);
      this._sendByte(startFrom);

      this._startResponseTimer(); // timeout counter
    });

    return this._createMessageObserver();
  }

  /**
   * Write data to the body of the message
   * 
   * @param {number[]} data An array of bytes.
   */
  sendData(data:any): void {
    if (typeof data.length === 'undefined') {
      data = [data];
    }

    this._sentLen += data.length;
    
    if (this._sentLen > this._fullDataLen) {
      this._messageObserver.error('Cannot send more data than you defined as length ('+ this._fullDataLen +')');
      return;
    }
    
    this._sendBytes(data);
  }

  /**
   * Finish the message by sending the CRC values.
   * 
   * @param {BusMasterStatus} status (optional) The status to resolve the message promise with.
   */
  endMessage(error:string=null): Observable<number> {

    // End addressing message
    if (this._addressing) {
      this._addressing = false;

      // Send 0xFF twice, if not already
      if (this.nodeNum < 255) { 
        this._sendBytes([0xFF, 0xFF]);
      }

      // Send null message to wrap things up
      this._crc = 0xFFFF;
      this._sendBytes([
        0x00,     // flags
        0x00,     // broadcast address
        CMD.NULL, // NULL command
        0,        // length
      ]);
    } 

    // Send CRC
    let crcBytes = this._convert16bitTo8(this._crc);
    this._sendBytes(crcBytes, false);

    // Resolve message observer
    if (this._messageObserver) {

      if (error) {
        this._messageObserver.error(error);
        return;
      }

      this._serial.port.drain( (err) => {
        if (err) {
          this._messageObserver.error(err);
        }
        this._messageObserver.complete();
      });
    } 
    return this.msgSubscription;
  }

  /**
   * Create a hot observer for a message 
   */
  private _createMessageObserver():Observable<number> {
    let source = Observable.create( (observer:Observer<number>) => {
      this._messageObserver = observer;
    });

    this.msgSubscription = source.publish();
    this.msgSubscription.connect();
    return this.msgSubscription;
  }

  /**
   * Handle new data returned from the bus
   * 
   * @param {Buffer} data A buffer of new data from the serial connection
   */
  private _handleData(data:Buffer): void {
    this._restartResponseTimer();

    // Address responses
    if (this._addressing) {
      let addr = data.readUInt8(data.length-1); // We only care about the final byte

      // Verify it's 1 larger than the last address
      if (addr == this.nodeNum + 1) {
        this.nodeNum++;
        this._addressCorrections = 0;
        this._sendByte(this.nodeNum); // confirm address
        this._messageObserver.next(this.nodeNum);
      }
      // Invalid address
      else {
        this._addressCorrections++;

        // Max tries, end in error
        if (this._addressCorrections > MAX_ADDRESS_CORRECTIONS) {
          this.endMessage('maximum address corrections');
        }
        // Address correction: send 0x00 followed by last valid address
        else {
          this._sendByte(0x00);
          this._sendByte(this.nodeNum);
        }
      }
    }
    // Response data
    else if (this._msgOptions.responseMsg) {
      this._pushDataToResponse(data);

      // End message if we've received everything
      if (this._responseCount >= this._fullDataLen) {
        this.endMessage();
      }
    }
  }

  /**
   * Handle a timeout waiting for a response value
   */
  private _handleResponseTimeout(): void {
    
    // Addressing timeout 
    if (this._addressing) {
      this.endMessage();
    }
    // Response message 
    else if (this._msgOptions.responseMsg) {
      let index = this._getResponseNodeIndex();
      let nodeMsg = this.msgResponse[index];
      let fill = this._msgOptions.responseDefault.slice(nodeMsg.length);

      // Fill in missing node message data
      if (fill.length > 0) {
        this._pushDataToResponse(Buffer.from(fill));
      }
    }
  }

  /**
   * Push received data to the proper sections in the reponse object
   */
  private _pushDataToResponse(data:Buffer): void {
    // Break it up across node arrays
    for (let i = 0; i < data.length; i++) {
      let n = this._getResponseNodeIndex();
      if (n === -1) return; // Response buffer full
      this.msgResponse[n].push(data.readUInt8(i));
      this._responseCount++;
    }
  }

  /**
   * Return the message response node index we're currently processing.
   * For messages that are not batch mode (single message responses) this will always be 0.
   * This returns -1 when all data has been received.
   * 
   * @return {number}
   */
  private _getResponseNodeIndex(): number {
    if (this._msgOptions.batchMode && this._msgOptions.responseMsg) {
      let i = this.msgResponse.length - 1;

      if (i < 0) {
        i = 0;
      }
      // This node's response is full, move to the next node
      else if (this.msgResponse[i] && this.msgResponse[i].length == this._dataLen) {
        i++;
      }

      // All nodes have returned, return -1
      if (i > this.nodeNum) {
        return -1;
      }

      // Init the next response group
      if (typeof this.msgResponse[i] === 'undefined') {
        this.msgResponse[0] = [];
      }
    }
    else {
      // If all data has been received, return -1
      if (this.msgResponse[0] && this.msgResponse[0].length >= this._dataLen) {
        return -1;
      }
    }
    return 0;
  }

  /**
   * Start (or restart) the response value timeout counter.
   */
  private _startResponseTimer() {
    this._stopResponseTimer();

    // Start timer once data has sent
    this._serial.port.drain(() => {
      this._responseTimer = setTimeout(() => {
        this._handleResponseTimeout();
      }, RESPONSE_TIMEOUT); 
    });
  }
  private _restartResponseTimer() {
    this._startResponseTimer();
  }

  /**
   * Stop the response timeout
   */
  private _stopResponseTimer() {
    if (this._responseTimer) {
      clearTimeout(this._responseTimer);
      this._responseTimer = null;
    }
  }

  /**
   * Send a byte to the serial connection and update the CRC value
   * 
   * @param {number} value The byte value to send.
   * @param {boolean} updateCRC Set this to false to not update the CRC with this byte
   */
  private _sendByte(value:number, updateCRC:boolean=true): void {
    this._sendBytes([value], updateCRC);
  }

  /**
   * Send multiple bytes to the serial connection and update the CRC value.
   * 
   * @param {number[]} values The bytes to send.
   * @param {boolean} updateCRC Set this to false to not update the CRC with this byte
   */
  private _sendBytes(values:number[], updateCRC:boolean=true): void {
    let buff = Buffer.from(values);
    this._serial.port.write(buff);
    
    if (updateCRC) {
      for (let i = 0; i < buff.length; i++) {
        this._crc = this._generateCRC(this._crc, buff.readUInt8(i));
      }
    }
  }

  /**
   * Generate a 16-bit CRC number.
   * 
   * @param {number} crc (optional) Existing CRC
   * @param {number or Array} value The new number, or array of numbers, to add to the CRC.
   * 
   * @return {number} A 16-bit CRC.
   */
  private _generateCRC(crc, value): number {

    // No CRC specified, define it.
    if (arguments.length == 1) {
      value = crc;
      crc = undefined;
    }
    if (crc === undefined || crc === null) {
      crc = 0xFFFF;
    }

    // Add an array of numbers to the CRC
    if (typeof value == 'object') {

      if (!value.length) {
        console.error('Invalid value to generate CRC from.');
        return crc;
      }

      crc = value.reduce( (c, val) => {
        return this._generateCRC(c, val);
      }, crc);
      return crc;
    }

    // Generate CRC
    crc ^= value;
    for (var i = 0; i < 8; ++i) {
      if (crc & 1)
        crc = (crc >> 1) ^ 0xA001;
      else
        crc = (crc >> 1);
    }

    // Wrap into 16-bit word
    if (crc > 0xFFFF) {
      crc = crc % 0xFFFF;
    }

    return crc;
  }

  /**
   * Split a 16-bit number into two 8-bit numbers.
   * 
   * Tip: you can then use `num.toString(16)` to get the hex value.
   * 
   * @param {number} value The 16-bit number to split
   * 
   * @return {Array} An array of two 8-bit numbers.
   */
  private _convert16bitTo8 (value:number): [number, number] {
    return [
        (value >> 8) & 0xFF,
        value & 0xFF,
    ];
  }
}