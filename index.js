(function () {
    'use strict';
    var restler = require('restler');
    var validUrl = require('valid-url');

    var connected = false;

    var PASSWORD,
        DELUGE_URL,
        SESSION_COOKIE = '';

    module.exports = function (deluge_url, password) {
        DELUGE_URL = deluge_url;
        PASSWORD = password;

        return {
            add: function (magnet, dlPath, callback) {
                executeApiCall(function () {
                    add(magnet, dlPath, callback);
                })
            }
        }
    };

    function authenticate(callback) {
        auth(function (err, result, response) {
            if (!err) {
                SESSION_COOKIE = getCookie(response.headers);
                console.log('Authenticate with deluge server...');

                isConnected(function (err, result) {
                    if (!err && result) {
                        connected = true;
                        console.log('Connected to deluge on ' + DELUGE_URL);
                        callback();
                    } else {
                        console.error('Deluge-web not connected to deluge damon');
                    }
                });
            } else {
                console.error('Problems connecting to deluge: ', err, response.error);
            }
        });
    }

    /**
     * Connect if not connected then execute the callback method
     * @param callback
     */
    function executeApiCall(callback) {
        if (connected) {
            checkSession(function (error, result) {
                if (error || !result) {
                    authenticate(callback);
                } else {
                    callback();
                }
            })
        } else {
            authenticate(callback);
        }
    }

    function checkSession(callback) {
        post({
            id: 1,
            params: [SESSION_COOKIE],
            method: 'auth.check_session'
        }, callback);
    }

    function auth(callback) {
        post({
            id: 1,
            params: [PASSWORD],
            method: 'auth.login'
        }, callback);
    }

    function isConnected(callback) {
        post({
            id: 1,
            method: 'web.connected',
            params: []
        }, callback);
    }

    function getHosts(callback) {
        post({
            method: 'web.get_hosts',
            params: [],
            id: 1
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
    function downloadTorrentFile(url, callback) {
        post({
            method: 'web.download_torrent_from_url',
            id: 1,
            params: [url]
        }, callback);
    }

    function add(torrent, dlPath, callback) {
        if (validUrl.isWebUri(torrent)) {
            downloadTorrentFile(torrent, function (error, result) {
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
            id: 1,
            params: [[{
                path: magnet,
                options: {
                    file_priorities: [],
                    add_paused: false,
                    compact_allocation: false,
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

})();
