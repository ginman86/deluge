deluge  [![NPM Version](https://img.shields.io/npm/v/deluge.svg?style=flat)](https://www.npmjs.com/package/deluge) ![Node Version](https://img.shields.io/node/v/deluge.svg?style=flat) ![Downloads](https://img.shields.io/npm/dm/deluge.svg?style=flat)
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
deluge = require('deluge')(delugeUrl, password);
```

**delugeUrl** is the address of your deluge-web server with "json" appended. ex http://192.168.0.100:8112/json

**password** is the password of your deluge-web server - default "deluge".


Methods
---
### add(magnet, dlpath callback) or add(file, dlpath, callback) or add(url, dlpath, callback)

Call add with a magnet link to automatically post the add request to your deluge-web server. If successful, it will add and start downloading without further action.
You can also use a direct url to a torrent file, deluge will download the file and star the download

### getHosts(callback)

Return the list of all the deluge daemon registered in the WebUI

### connect(hostID, callback)

Tell the WebUI to connect to the wanted host. The result of the callback will be either TRUE if connected or FALSE if not connected.
