(function () {
    'use strict';
    var fs = require('fs');
    var path = require('path');
    var restler = require('restler');
    var validUrl = require('valid-url');

    var connected = false;
    var isAuthentificated = false;

    var msgId = 0;

    var PASSWORD,
        DELUGE_URL,
        SESSION_COOKIE = '',
        COOKIE_JAR = {};

    module.exports = function (deluge_url, password) {
        DELUGE_URL = deluge_url;
        PASSWORD = password;
        return {
            /**
             * Add the torrent to Deluge
             * @param magnet
             * @param dlPath
             * @param callback
             */
            add: function (magnet, dlPath, callback) {
                executeApiCall(function () {
                    add(magnet, dlPath, callback);
                })
            },
            /**
             * Get the list of all the hosts that the WebUI can connect to
             * @param callback
             */
            getHosts: function (callback) {
                executeApiCall(function () {
                    getHostList(callback);
                }, false)
            },
            /**
             * Connect the WebUI to the wanted daemon
             * @param hostID
             * @param callback
             */
            connect: function (hostID, callback) {
                executeApiCall(function () {
                    connectToDaemon(hostID, callback);
                }, false)
            },

            isConnected: function(callback) {
                executeApiCall(function(){
                    isConnected(callback);
                }, false)
            },

            /**
             * Set cookies in COOKIE_JAR, cookies is an object with urls as keys, example:
             * {'http://example.org/': 'uid=1234;pass=xxxx;'}
             * @object cookies
             */
            setCookies: function(cookies, callback) {
                setCookies(cookies, callback);
            }
        }
    };

    function setCookies(cookies, callback) {
        if(cookies !== null && typeof cookies === 'object'){
            console.log('Setting new cookies');
            COOKIE_JAR = cookies;
            callback(null,true);
        } else {
            callback(new Error('Invalid cookie format, should be an object. COOKIE_JAR not changed.'),false);
        }

    }

    function authenticate(callback) {
        function reAuth() {
            auth(function (err, result, response) {
                if (!err) {
                    SESSION_COOKIE = getCookie(response.headers);
                    console.log('Authenticate with deluge server...');
                    isAuthentificated = true;
                } else {
                    console.error('Problems connecting to deluge: ', err, response.error);
                }
                callback(err, result);
            });
        }

        if (isAuthentificated) {
            checkSession(function (error, result) {
                if (error || !result) {
                    reAuth();
                }
                else {
                    callback(null, isAuthentificated);
                }
            })
        } else {
            reAuth();
        }

    }

    /**
     * Connect if not connected then execute the callback method
     * @param callback
     */
    function executeApiCall(callback, needConnection) {
        needConnection = typeof needConnection !== 'undefined' ? needConnection : true;
        authenticate(function (error, result) {
            if (error || !result) {
                callback(error, result);
                return;
            }
            if (needConnection) {
                isConnected(function (error, result) {
                    if (error || !result) {
                        console.error("[Deluge] WebUI not connected to a daemon");
                        return;
                    }
                    callback(error, result);
                });
            } else {
                callback(error, result);
            }
        });
    }

    function checkSession(callback) {
        post({
            params: [SESSION_COOKIE],
            method: 'auth.check_session'
        }, function (error, result) {
            isAuthentificated = error || !result;
            callback(error, result);
        });
    }

    function auth(callback) {
        post({
            params: [PASSWORD],
            method: 'auth.login'
        }, callback);
    }

    function isConnected(callback) {
        post({
            method: 'web.connected',
            params: []
        }, function (err, result) {
            if (err) {
                callback(err);
            } else {
                callback(null, result);
            }
        });
    }

    function getHosts(callback) {
        post({
            method: 'web.get_hosts',
            params: []
        }, callback);
    }

    function decodeServerResponse(result, callback, response) {
        result = JSON.parse(result);
        if (result['error']) {
            callback(result['error'], null, response);
            return;
        }
        callback(null, result['result'], response);
    }

    /**
     * Download a torrent file from an url
     * @param url
     * @param callback containing the error and the path where the torrent file have been downloaded
     */
    function downloadTorrentFile(url, cookie, callback) {
        post({
            method: 'web.download_torrent_from_url',
            params: [url,cookie]
        }, callback);
    }

    /**
     * Search for a URL in the cookie jar.
     * @param url
     */
    function searchCookieJar(url){
        var cookie = '';
        for (var key in COOKIE_JAR) {
            // Check if url starts with key, see: http://stackoverflow.com/q/646628/2402914
            if (COOKIE_JAR.hasOwnProperty(key) && url.lastIndexOf(key, 0) === 0) {
                cookie = COOKIE_JAR[key];
                console.log("Using cookies for "+key);
                break;
          }
        }
        return cookie;
    }

    function add(torrent, dlPath, callback) {
        if (validUrl.isWebUri(torrent)) {
            downloadTorrentFile(torrent, searchCookieJar(torrent), function (error, result) {
                if (error) {
                    callback(error);
                    return;
                }
                addTorrent(result, dlPath, callback);

            })
        } else {
            addTorrent(torrent, dlPath, callback);
        }
    }

    function addTorrent(magnet, dlPath, callback) {
        console.log("Adding: " + magnet);
        post({
            method: 'web.add_torrents',
            params: [[{
                path: magnet,
                options: {
                    file_priorities: [],
                    add_paused: false,
                    compact_allocation: true,
                    download_location: dlPath,
                    max_connections: -1,
                    max_download_speed: -1,
                    max_upload_slots: -1,
                    max_upload_speed: -1,
                    prioritize_first_last_pieces: false
                }
            }]]
        }, callback);
    }

    function post(body, callback) {
        body.id = ++msgId;
        if (msgId > 1024) {
            msgId = 0;
        }
        restler.postJson(DELUGE_URL, body, {
            headers: {
                'Cookie': SESSION_COOKIE
            }
        })
            .on('success', function (result, response) {
                decodeServerResponse(result, callback, response);
            });
    }

    function getCookie(headers) {
        var cookie;

        if (headers && headers['set-cookie']) {
            cookie = headers['set-cookie'][0].split(';')[0];
        }

        return cookie;
    }

    function getHostList(callback) {
        post({
            method: 'web.get_hosts',
            params: []
        }, function (error, result) {
            if (error) {
                callback(error);
                return;
            }
            var hosts = [];
            result.forEach(function (element, index) {
                hosts[index] = {id: element[0], ip: element[1], port: element[2], status: element[3]};
            });
            callback(null, hosts);
        });
    }

    function connectToDaemon(hostID, callback) {
        post({
            method: 'web.connect',
            params: [hostID]
        }, function (error) {
            if (error) {
                callback(error, false);
                return;
            }
            isConnected(callback);
        });
    }

})();
