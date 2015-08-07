Disco Floor Node
================

Code for a single dance floor node. It handles sending and
receiving message via RS485 to and from the master node.

For a simple test setup, you can make one of the nodes the "master"
by bringing pin 5 high. This node will then run the network through
a node registration and a series of simple programs.

## Wiring

### Arduino

(see Circuit Diagrams below)

```
0:   To pin 1 of RS485 chip (RO)
1:   To pin 4 of RS485 chip (DI)
2:   To both TX/RX enable pins of RS485 chip (pins 2 & 3)
3:   Connect to pin 4 with 1M resistor
4:   To capacitive touch sensor area (eg, bare wire, sheet of aluminum foil, etc)
5:   To pin 6 of next node
6:   From pin 5 of the previous node or master
9:   To green pin of RGB LED
10:  To blue pin of RGB LED
11:  To red pin of RGB LED
12:  (master only, optional) Attach to pin 13 of either node to receive debugging statements
13:  (optional) Attach to master's pin 12, for debugging statements.
```

### RS485 chip (MAX485 or ISL8487E)

I'm using the [Intersil ISL8487E](http://www.digikey.com/product-detail/en/ISL8487EIBZ/ISL8487EIBZ-ND/1034816) chip
which is pin compatible with MAS485, but cheaper. Both pins 2 and 3 (RE & DE) can be wired together and then connected
to pin 7 of the floor node.

```
1:   To pin 0 (RX) of floor node
2:   To pin 2 of floor node
3:   To pin 2 of floor node
4:   To pin 1 (TX) of floor node
5:   To 5V
6:   Bus A/Y
7:   Bus B/Z
8:   To common
```

## Test Master (deprecated)

You can make at Atmega the master, instead of communicating with the computer. This can be one way of testing the floor cells and the communication bus.

1. Compile program with `DUMMY_MASTER` defined (and make sure those blocks are uncommented)
2. Connect pin 7 to VCC on the master node and GND on all floor cell nodes.

### Test Master Flow

How the test master communicated with the floor cells

1. Enable first floor node (pin 5 HIGH)
2. Ask for the node's address (repeat message after ACK_TIMEOUT)
3. When node responds with address, respond with ACK. Node will then enable the next node.
4. Repeat steps 3 & 4 until no more nodes respond for 5 seconds (defined by ADDRESSING_TIMEOUT)
5. Get status of all nodes
  1. Send global (*) request for node status.
  2. Each node responds with current state: current color, is fading (1 or 0), and if sensor detects person (1 or 0)
  3. If the repsonse chain fails for some reason (i.e. node 3 doesn't respond), master sends another status
     request for all nodes from that node forward (3-*).
  4. If still no status response from the same node, move to the next node forward (4-*)
6. Run programs, switching every 10 seconds (defined by PROGRAM_TIMEOUT):
  1. Color program: Sets ALL LEDs to a single solid color.
  2. Differnet color program: Sets all LEDs to different solid colors.
  3. Fade program: Fade all LEDs to different colors.
  4. Repeat

## Libraries

In order to make the libraries available to the horrible Arduino IDE for compiling, put everything in the libraries directory
in Arduino's library directory (i.e. For mac: ~/Documents/Arduino/libraries/)

## Circuit Diagrams

### Bare Atmega168
![Schematic](/Arduino/DiscoFloorNode/circuit/DiscoFloor_schem.png)
![BreadBoard](/Arduino/DiscoFloorNode/circuit/DiscoFloor_breadboard.png)

### Using Arduino
![Arduino](/Arduino/DiscoFloorNode/circuit/Arduino_breadboard.png)

## Bare Atmega168 and Fuse Bits
(note to self)
If you're using a bare Atmega328, you'll have to first set the fuse bits, otherwise it will run verrrrrry slow:
```
avrdude -p atmega328p -c usbtiny -F -e -U lfuse:w:0xFF:m -U hfuse:w:0xDA:m -U efuse:w:0x05:m
```
This assumes you're using the USBTiny programmer.
