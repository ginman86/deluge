deluge [![NPM Version](https://img.shields.io/npm/v/deluge.svg?style=flat)](https://www.npmjs.com/package/deluge) ![Node Version](https://img.shields.io/node/v/deluge.svg?style=flat) ![Downloads](https://img.shields.io/npm/dm/deluge.svg?style=flat)
=======

Licensed under the MIT-LICENSE

add magnet links and torrents to a deluge (specifically deluge-web) instance.

Installing
----------

```
npm install deluge
```

Basic usage
---

```
deluge = require('deluge')(delugeUrl, password, downloadLocation);
```

**delugeUrl** is the address of your deluge-web server with "json" appended. ex http://192.168.0.100:8112/json

**password** is the password of your deluge-web server - default "deluge".

**downloadLocation** is the target path to save your download. ex. /media/USBHDD1/share/downloading

I keep my url and location in a config, and password in a credentials file.
```
  clients: {
    deluge: {
      url: "http://192.168.0.100:8112/json",
      downloadLocation: "/media/USBHDD1/share/downloading"
    }
  }
  ```
  
Methods
---
### add(magnet, callback) or add(file, callback)

Call add with a magnet link to automatically post the add request to your deluge-web server. If successful, it will add and start downloading without further action.
