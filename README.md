# Karabako (&#31354;&#31665;)

Karabako is a simple streaming video server meant to be used with the SKYBOX VR Player smartphone app.
It has been tested on Linux, but probably works on other platforms as well.

### Prerequisites

* NodeJS (https://nodejs.org/)
* ffprobe (from the FFmpeg suite, https://ffmpeg.org/)

### Usage

First install required dependencies with:
`npm install`

Then start with:
`node app.js`

By default it looks for video files in the current directory. The first argument can be used to specify another directory.
It attempts to figure out the IP address of the LAN Ethernet interface automatically.

### License

Released into the public domain.
