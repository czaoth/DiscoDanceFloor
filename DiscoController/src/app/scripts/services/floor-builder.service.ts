
import { Inject } from '@angular/core';

import { StorageService } from './storage.service';
import { CommunicationService } from './communication.service';
import { FloorCell } from '../../../shared/floor-cell';
import { FloorCellList } from '../../../shared/floor-cell-list';

/**
 * Given the floor dimensions, this will add all the
 * floor cells in the correct order, based on the 4x4 layout.
 *
 * The Four-by-Four layout
 * ------------------------
 * This floor layout is divided into smaller 16 cell sections (4x4).
 * The input/output connectors for each section are along the top and
 * the cells go back and forth along the y-axis.
 *
 * ## Example:
 * For a floor made of four 4x4 sections, the cell order would be something
 * like this (the arrows represent input/output):
 * 
 * ```
 * >>> 0   7   8   15 >>> 16  23  24  31 >>>,
 *     1   6   9   14  |  17  22  25  30    ▼
 *     2   5   10  13  |  18  21  26  29    ▼
 *     3   4   11  12  |  19  20  27  28    ▼
 *     -------------------------------      ▼
 * <<< 63  56  55  48 <<< 47  40  39  32 <<<'
 *     62  57  54  49  |  46  41  38  33
 *     61  58  53  50  |  45  42  37  34
 *     60  59  52  51  |  44  43  36  35
 * ```
 */
export class FloorBuilderService {

  public cellList: FloorCellList;

  private cells: FloorCell[] = [];
  private cellMap:FloorCell[][] = [];
  private x: number = 0;
  private y: number = 0;
  private _comm:CommunicationService;

  constructor(
    @Inject(StorageService) private _storage:StorageService) {

    _storage.storageChanged$.subscribe(
      changed => {
        // Dimentions might have changed, rebuild floor
        this._buildFromSettings();
      }
    )
    this._buildFromSettings();
  }

  /**
   * Add a reference to the communication service
   */
  setComm(comm:CommunicationService) {
    this._comm = comm;
  }


  /**
   * Build the floor with the dimensions defined in the local storage settings
   */
  private _buildFromSettings() {
    let settings = this._storage.getItem('settings'),
        cellNum = this._storage.getItem('connection.numNodes') || 0;

    if (cellNum === 0 || !this._comm || !this._comm.isConnected()) {
      cellNum = settings.dimensions.x * settings.dimensions.y;
    }

    this.build(cellNum, settings.dimensions.x, settings.dimensions.y)
  }

  /**
   * Build the floor with new dimension
   *
   * @param {int} num The total number of floor cells.
   * @param {int} floorX The max length of the floor's x axis
   * @param {int} floorY The max length of the floor's y axis
   */
  build(num:number, floorX:number, floorY:number): FloorCellList {
    var x = 0,
        y = 0,
        xDir = 1,
        yDir = 1,
        map = [],
        xFlipped = false,
        yFlipped = false;

    floorX = floorX || 0;
    floorY = floorY || 0;

    // Update dimensions, if they don't fit 4x4 sections
    if ((floorX % 4 !== 0 || floorY % 4 !== 0)) {
      this._deterimineDimensions(num);
    } else {
      this.x = floorX;
      this.y = floorY;
    }

    // Build grid
    for (var i = 0; i < num; i++) {
      var cell = this.cells[i];

      // Set cell position
      if (!cell) {
        cell = new FloorCell();
        this.cells[i] = cell;
      }
      cell.index = i;
      cell.x = x;
      cell.y = y;

      // Add index to x/y map
      if (!map[x]) {
        map[x] = [];
      }
      map[x][y] = cell;

      // Move up and down by 4s
      // If we hit the top or bottom of 4s, switch y direction
      if (!yFlipped && (
          ((y + 1) % 4 === 0 && yDir > 0)  ||
          (y % 4 === 0 && yDir < 0))){
        yDir *= -1;
        x += xDir;
        yFlipped = true;
      } else {
        y += yDir;
        yFlipped = false;
      }

      // End of x-axis
      if (!xFlipped && (x >= this.x || x < 0)) {
        yDir = 1;
        xDir *= -1;
        y += 4;

        if (y > this.y) {
          y = this.y - 1;
        }

        if (x >= this.x){
          x = this.x - 1;
        } else {
          x = 0;
        }

        xFlipped = true;
        yFlipped = true;
      } else {
        xFlipped = false;
      }
    }

    // Truncate cell array
    if (this.cells.length > num) {
      this.cells.splice(num);
    }

    // Get actual dimensions of the floor
    this.x = map.length;
    this.y = (this.x > 0) ? map[0].length : 0;
    
    this._storage.setItem('settings.dimensions.x', this.x);
    this._storage.setItem('settings.dimensions.y', this.y);
    
    console.log('Build floor with', num, 'nodes, in', this.x, 'x', this.y);

    this.cellMap = map;
    this.cellList = new FloorCellList(this.cells, this.cellMap, this.x, this.y);
    return this.cellList;
  }

  /**
   * Given the number of floor cells, determine the optimal
   * grid made of 4x4 sections
   *
   * @params {int} num Number of floor cells
  */
  _deterimineDimensions(num) {
    var sections = Math.ceil(num / 16),
        sqrt = Math.sqrt(sections),
        x, y;

    // Try to divide it evenly
    if (sections % Math.floor(sqrt) === 0) {
      y = Math.floor(sqrt);
      x = sections / y;
    } else {
      x = Math.ceil(sqrt);
      y = Math.round(sqrt);
    }

    // Cut down the extra empty sections in the grid
    while ((x * y) - sections > 1) {
      x++;
      y--;
    }

    this.x = x * 4;
    this.y = y * 4;
  }
}