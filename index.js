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
             * Add Trackers to Deluge
             * @param magnet
             * @param dlPath
             * @param callback
             */
            addTrackers: function (guid, callback) {
                executeApiCall(function () {
                    addTrackers(guid, callback);
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

            isConnected: function (callback) {
                executeApiCall(function () {
                    isConnected(callback);
                }, false)
            },

            /**
             * Set cookies in COOKIE_JAR, cookies is an object with urls as keys, example:
             * {'http://example.org/': 'uid=1234;pass=xxxx;'}
             * @object cookies
             */
            setCookies: function (cookies, callback) {
                setCookies(cookies, callback);
            },

            /**
             * Get the list of all torrents and changing data that represents their status in the WebUI
             * @param callback
             */
            getTorrentRecord: function (callback) {
                executeApiCall(function () {
                    getTorrentRecord(callback);
                })
            }
        }
    };

    function setCookies(cookies, callback) {
        if (cookies !== null && typeof cookies === 'object') {
            console.log('Setting new cookies');
            COOKIE_JAR = cookies;
            callback(null, true);
        } else {
            callback(new Error('Invalid cookie format, should be an object. COOKIE_JAR not changed.'), false);
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
            params: [url, cookie]
        }, callback);
    }

    /**
     * Search for a URL in the cookie jar.
     * @param url
     */
    function searchCookieJar(url) {
        var cookie = '';
        for (var key in COOKIE_JAR) {
            // Check if url starts with key, see: http://stackoverflow.com/q/646628/2402914
            if (COOKIE_JAR.hasOwnProperty(key) && url.lastIndexOf(key, 0) === 0) {
                cookie = COOKIE_JAR[key];
                console.log("Using cookies for " + key);
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

    /*
        Sets Default Torrent Trackers
        the GUID is the torrent ID
     */
    function addTrackers(guid, callback) {
        console.log("Adding Default Trackers");
        post({
                "method": "core.set_torrent_trackers",
                "params": [guid,
                    [{"tier": 0, "url": "http://tracker.trackerfix.com:80/announce"}, {
                        "tier": 0,
                        "url": "udp://9.rarbg.me:2710"
                    }, {"tier": 0, "url": "udp://9.rarbg.to:2710"}, {
                        "tier": 1,
                        "url": "udp://public.popcorn-tracker.org:6969/announce"
                    }, {"tier": 2, "url": "http://182.176.139.129:6969/announce"}, {
                        "tier": 3,
                        "url": "http://5.79.83.193:2710/announce"
                    }, {"tier": 4, "url": "http://91.218.230.81:6969/announce"}, {
                        "tier": 5,
                        "url": "udp://tracker.ilibr.org:80/announce"
                    }, {"tier": 6, "url": "http://atrack.pow7.com/announce"}, {
                        "tier": 7,
                        "url": "http://bt.henbt.com:2710/announce"
                    }, {"tier": 8, "url": "http://mgtracker.org:2710/announce"}, {
                        "tier": 9,
                        "url": "http://mgtracker.org:6969/announce"
                    }, {"tier": 10, "url": "http://open.touki.ru/announce.php"}, {
                        "tier": 11,
                        "url": "http://p4p.arenabg.ch:1337/announce"
                    }, {"tier": 12, "url": "http://pow7.com:80/announce"}, {
                        "tier": 13,
                        "url": "http://retracker.krs-ix.ru:80/announce"
                    }, {"tier": 14, "url": "http://secure.pow7.com/announce"}, {
                        "tier": 15,
                        "url": "http://t1.pow7.com/announce"
                    }, {"tier": 16, "url": "http://t2.pow7.com/announce"}, {
                        "tier": 17,
                        "url": "http://thetracker.org:80/announce"
                    }, {"tier": 18, "url": "http://torrentsmd.com:8080/announce"}, {
                        "tier": 19,
                        "url": "http://tracker.bittor.pw:1337/announce"
                    }, {"tier": 20, "url": "http://tracker.dutchtracking.com:80/announce"}, {
                        "tier": 21,
                        "url": "http://tracker.dutchtracking.nl:80/announce"
                    }, {"tier": 22, "url": "http://tracker.edoardocolombo.eu:6969/announce"}, {
                        "tier": 23,
                        "url": "http://tracker.ex.ua:80/announce"
                    }, {"tier": 24, "url": "http://tracker.kicks-ass.net:80/announce"}, {
                        "tier": 25,
                        "url": "http://tracker1.wasabii.com.tw:6969/announce"
                    }, {"tier": 26, "url": "http://tracker2.itzmx.com:6961/announce"}, {
                        "tier": 27,
                        "url": "http://www.wareztorrent.com:80/announce"
                    }, {"tier": 28, "url": "udp://62.138.0.158:6969/announce"}, {
                        "tier": 29,
                        "url": "udp://eddie4.nl:6969/announce"
                    }, {"tier": 30, "url": "udp://explodie.org:6969/announce"}, {
                        "tier": 31,
                        "url": "udp://shadowshq.eddie4.nl:6969/announce"
                    }, {"tier": 32, "url": "udp://shadowshq.yi.org:6969/announce"}, {
                        "tier": 33,
                        "url": "udp://tracker.eddie4.nl:6969/announce"
                    }, {"tier": 34, "url": "udp://tracker.mg64.net:2710/announce"}, {
                        "tier": 35,
                        "url": "udp://tracker.sktorrent.net:6969"
                    }, {"tier": 36, "url": "udp://tracker2.indowebster.com:6969/announce"}, {
                        "tier": 37,
                        "url": "udp://tracker4.piratux.com:6969/announce"
                    }, {"tier": 38, "url": "http://atrack.pow7.com/announce"}, {
                        "tier": 39,
                        "url": "http://bt.henbt.com:2710/announce"
                    }, {"tier": 40, "url": "http://mgtracker.org:2710/announce"}, {
                        "tier": 41,
                        "url": "http://mgtracker.org:6969/announce"
                    }, {"tier": 42, "url": "http://open.touki.ru/announce.php"}, {
                        "tier": 43,
                        "url": "http://p4p.arenabg.ch:1337/announce"
                    }, {"tier": 44, "url": "http://pow7.com:80/announce"}, {
                        "tier": 45,
                        "url": "http://retracker.krs-ix.ru:80/announce"
                    }, {"tier": 46, "url": "http://secure.pow7.com/announce"}, {
                        "tier": 47,
                        "url": "http://t1.pow7.com/announce"
                    }, {"tier": 48, "url": "http://t2.pow7.com/announce"}, {
                        "tier": 49,
                        "url": "http://thetracker.org:80/announce"
                    }, {"tier": 50, "url": "http://torrentsmd.com:8080/announce"}, {
                        "tier": 51,
                        "url": "http://tracker.bittor.pw:1337/announce"
                    }, {"tier": 52, "url": "http://tracker.dutchtracking.com/announce"}, {
                        "tier": 53,
                        "url": "http://tracker.dutchtracking.com:80/announce"
                    }, {"tier": 54, "url": "http://tracker.dutchtracking.nl:80/announce"}, {
                        "tier": 55,
                        "url": "http://tracker.edoardocolombo.eu:6969/announce"
                    }, {"tier": 56, "url": "http://tracker.ex.ua:80/announce"}, {
                        "tier": 57,
                        "url": "http://tracker.kicks-ass.net:80/announce"
                    }, {"tier": 58, "url": "http://tracker.mg64.net:6881/announce"}, {
                        "tier": 59,
                        "url": "http://tracker.tfile.me/announce"
                    }, {"tier": 60, "url": "http://tracker1.wasabii.com.tw:6969/announce"}, {
                        "tier": 61,
                        "url": "http://tracker2.itzmx.com:6961/announce"
                    }, {"tier": 62, "url": "http://tracker2.wasabii.com.tw:6969/announce"}, {
                        "tier": 63,
                        "url": "http://www.wareztorrent.com:80/announce"
                    }, {"tier": 64, "url": "udp://bt.xxx-tracker.com:2710/announce"}, {
                        "tier": 65,
                        "url": "udp://eddie4.nl:6969/announce"
                    }, {"tier": 66, "url": "udp://shadowshq.eddie4.nl:6969/announce"}, {
                        "tier": 67,
                        "url": "udp://shadowshq.yi.org:6969/announce"
                    }, {"tier": 68, "url": "udp://tracker.eddie4.nl:6969/announce"}, {
                        "tier": 69,
                        "url": "udp://tracker.mg64.net:2710/announce"
                    }, {"tier": 70, "url": "udp://tracker.mg64.net:6969/announce"}, {
                        "tier": 71,
                        "url": "udp://tracker.opentrackr.org:1337/announce"
                    }, {"tier": 72, "url": "udp://tracker.sktorrent.net:6969"}, {
                        "tier": 73,
                        "url": "udp://tracker2.indowebster.com:6969/announce"
                    }, {"tier": 74, "url": "udp://tracker4.piratux.com:6969/announce"}, {
                        "tier": 75,
                        "url": "udp://tracker.coppersurfer.tk:6969/announce"
                    }, {"tier": 76, "url": "http://tracker.opentrackr.org:1337/announce"}, {
                        "tier": 77,
                        "url": "udp://zer0day.ch:1337/announce"
                    }, {"tier": 78, "url": "udp://zer0day.to:1337/announce"}, {
                        "tier": 79,
                        "url": "http://explodie.org:6969/announce"
                    }, {"tier": 80, "url": "udp://tracker.leechers-paradise.org:6969/announce"}, {
                        "tier": 81,
                        "url": "udp://9.rarbg.com:2710/announce"
                    }, {"tier": 82, "url": "udp://9.rarbg.me:2780/announce"}, {
                        "tier": 83,
                        "url": "udp://9.rarbg.to:2730/announce"
                    }, {"tier": 84, "url": "udp://p4p.arenabg.com:1337/announce"}, {
                        "tier": 85,
                        "url": "udp://tracker.sktorrent.net:6969/announce"
                    }, {"tier": 86, "url": "http://p4p.arenabg.com:1337/announce"}, {
                        "tier": 87,
                        "url": "udp://tracker.aletorrenty.pl:2710/announce"
                    }, {"tier": 88, "url": "http://tracker.aletorrenty.pl:2710/announce"}, {
                        "tier": 89,
                        "url": "http://tracker.bittorrent.am/announce"
                    }, {"tier": 90, "url": "udp://tracker.kicks-ass.net:80/announce"}, {
                        "tier": 91,
                        "url": "http://tracker.kicks-ass.net/announce"
                    }, {"tier": 92, "url": "http://tracker.baravik.org:6970/announce"}, {
                        "tier": 93,
                        "url": "udp://torrent.gresille.org:80/announce"
                    }, {"tier": 94, "url": "http://torrent.gresille.org/announce"}, {
                        "tier": 95,
                        "url": "http://tracker.skyts.net:6969/announce"
                    }, {"tier": 96, "url": "http://tracker.internetwarriors.net:1337/announce"}, {
                        "tier": 97,
                        "url": "udp://tracker.skyts.net:6969/announce"
                    }, {"tier": 98, "url": "http://tracker.dutchtracking.nl/announce"}, {
                        "tier": 99,
                        "url": "udp://tracker.yoshi210.com:6969/announce"
                    }, {"tier": 100, "url": "udp://tracker.tiny-vps.com:6969/announce"}, {
                        "tier": 101,
                        "url": "udp://tracker.internetwarriors.net:1337/announce"
                    }, {"tier": 102, "url": "udp://mgtracker.org:2710/announce"}, {
                        "tier": 103,
                        "url": "http://tracker.yoshi210.com:6969/announce"
                    }, {"tier": 104, "url": "http://tracker.tiny-vps.com:6969/announce"}, {
                        "tier": 105,
                        "url": "udp://tracker.filetracker.pl:8089/announce"
                    }, {"tier": 106, "url": "udp://tracker.ex.ua:80/announce"}, {
                        "tier": 107,
                        "url": "udp://91.218.230.81:6969/announce"
                    }, {"tier": 108, "url": "https://www.wareztorrent.com/announce"}, {
                        "tier": 109,
                        "url": "http://www.wareztorrent.com/announce"
                    }, {"tier": 110, "url": "http://tracker.filetracker.pl:8089/announce"}, {
                        "tier": 111,
                        "url": "http://tracker.ex.ua/announce"
                    }, {"tier": 112, "url": "http://tracker.calculate.ru:6969/announce"}, {
                        "tier": 113,
                        "url": "udp://tracker.grepler.com:6969/announce"
                    }, {"tier": 114, "url": "udp://tracker.flashtorrents.org:6969/announce"}, {
                        "tier": 115,
                        "url": "udp://tracker.bittor.pw:1337/announce"
                    }, {"tier": 116, "url": "http://tracker.tvunderground.org.ru:3218/announce"}, {
                        "tier": 117,
                        "url": "http://tracker.grepler.com:6969/announce"
                    }, {"tier": 118, "url": "http://tracker.flashtorrents.org:6969/announce"}, {
                        "tier": 119,
                        "url": "http://retracker.gorcomnet.ru/announce"
                    }, {"tier": 120, "url": "http://bt.pusacg.org:8080/announce"}, {
                        "tier": 121,
                        "url": "http://87.248.186.252:8080/announce"
                    }, {"tier": 122, "url": "udp://tracker.kuroy.me:5944/announce"}, {
                        "tier": 123,
                        "url": "udp://182.176.139.129:6969/announce"
                    }, {"tier": 124, "url": "http://tracker.kuroy.me:5944/announce"}, {
                        "tier": 125,
                        "url": "http://retracker.krs-ix.ru/announce"
                    }, {"tier": 126, "url": "http://open.acgtracker.com:1096/announce"}, {
                        "tier": 127,
                        "url": "udp://open.stealth.si:80/announce"
                    }, {"tier": 128, "url": "udp://208.67.16.113:8000/announce"}, {
                        "tier": 129,
                        "url": "http://tracker.dler.org:6969/announce"
                    }, {"tier": 130, "url": "http://bt2.careland.com.cn:6969/announce"}, {
                        "tier": 131,
                        "url": "http://open.lolicon.eu:7777/announce"
                    }, {"tier": 132, "url": "http://tracker.opentrackr.org:1337/announce"}, {
                        "tier": 133,
                        "url": "http://explodie.org:6969/announce"
                    }, {"tier": 134, "url": "http://p4p.arenabg.com:1337/announce"}, {
                        "tier": 135,
                        "url": "http://tracker.aletorrenty.pl:2710/announce"
                    }, {"tier": 136, "url": "http://tracker.bittorrent.am/announce"}, {
                        "tier": 137,
                        "url": "http://tracker.kicks-ass.net/announce"
                    }, {"tier": 138, "url": "http://tracker.baravik.org:6970/announce"}, {
                        "tier": 139,
                        "url": "http://torrent.gresille.org/announce"
                    }, {"tier": 140, "url": "http://tracker.skyts.net:6969/announce"}, {
                        "tier": 141,
                        "url": "http://tracker.internetwarriors.net:1337/announce"
                    }, {"tier": 142, "url": "http://tracker.dutchtracking.nl/announce"}, {
                        "tier": 143,
                        "url": "http://tracker.yoshi210.com:6969/announce"
                    }, {"tier": 144, "url": "http://tracker.tiny-vps.com:6969/announce"}, {
                        "tier": 145,
                        "url": "http://www.wareztorrent.com/announce"
                    }, {"tier": 146, "url": "http://tracker.filetracker.pl:8089/announce"}, {
                        "tier": 147,
                        "url": "http://tracker.ex.ua/announce"
                    }, {"tier": 148, "url": "http://tracker.calculate.ru:6969/announce"}, {
                        "tier": 149,
                        "url": "http://tracker.tvunderground.org.ru:3218/announce"
                    }, {"tier": 150, "url": "http://tracker.grepler.com:6969/announce"}, {
                        "tier": 151,
                        "url": "http://tracker.flashtorrents.org:6969/announce"
                    }, {"tier": 152, "url": "http://retracker.gorcomnet.ru/announce"}, {
                        "tier": 153,
                        "url": "http://bt.pusacg.org:8080/announce"
                    }, {"tier": 154, "url": "http://87.248.186.252:8080/announce"}, {
                        "tier": 155,
                        "url": "http://tracker.kuroy.me:5944/announce"
                    }, {"tier": 156, "url": "http://retracker.krs-ix.ru/announce"}, {
                        "tier": 157,
                        "url": "http://open.acgtracker.com:1096/announce"
                    }, {"tier": 158, "url": "http://bt2.careland.com.cn:6969/announce"}, {
                        "tier": 159,
                        "url": "http://open.lolicon.eu:7777/announce"
                    }, {"tier": 160, "url": "https://www.wareztorrent.com/announce"}, {
                        "tier": 161,
                        "url": "udp://213.163.67.56:1337/announce"
                    }, {"tier": 162, "url": "http://213.163.67.56:1337/announce"}, {
                        "tier": 163,
                        "url": "udp://185.86.149.205:1337/announce"
                    }, {"tier": 164, "url": "http://74.82.52.209:6969/announce"}, {
                        "tier": 165,
                        "url": "udp://94.23.183.33:6969/announce"
                    }, {"tier": 166, "url": "udp://74.82.52.209:6969/announce"}, {
                        "tier": 167,
                        "url": "udp://151.80.120.114:2710/announce"
                    }, {"tier": 168, "url": "udp://109.121.134.121:1337/announce"}, {
                        "tier": 169,
                        "url": "udp://168.235.67.63:6969/announce"
                    }, {"tier": 170, "url": "http://109.121.134.121:1337/announce"}, {
                        "tier": 171,
                        "url": "udp://178.33.73.26:2710/announce"
                    }, {"tier": 172, "url": "http://178.33.73.26:2710/announce"}, {
                        "tier": 173,
                        "url": "http://85.17.19.180/announce"
                    }, {"tier": 174, "url": "udp://85.17.19.180:80/announce"}, {
                        "tier": 175,
                        "url": "http://210.244.71.25:6969/announce"
                    }, {"tier": 176, "url": "http://85.17.19.180/announce"}, {
                        "tier": 177,
                        "url": "http://213.159.215.198:6970/announce"
                    }, {"tier": 178, "url": "udp://191.101.229.236:1337/announce"}, {
                        "tier": 179,
                        "url": "http://178.175.143.27/announce"
                    }, {"tier": 180, "url": "udp://89.234.156.205:80/announce"}, {
                        "tier": 181,
                        "url": "http://91.216.110.47/announce"
                    }, {"tier": 182, "url": "http://114.55.113.60:6969/announce"}, {
                        "tier": 183,
                        "url": "http://195.123.209.37:1337/announce"
                    }, {"tier": 184, "url": "udp://114.55.113.60:6969/announce"}, {
                        "tier": 185,
                        "url": "http://210.244.71.26:6969/announce"
                    }, {"tier": 186, "url": "udp://107.150.14.110:6969/announce"}, {
                        "tier": 187,
                        "url": "udp://5.79.249.77:6969/announce"
                    }, {"tier": 188, "url": "udp://195.123.209.37:1337/announce"}, {
                        "tier": 189,
                        "url": "udp://37.19.5.155:2710/announce"
                    }, {"tier": 190, "url": "http://107.150.14.110:6969/announce"}, {
                        "tier": 191,
                        "url": "http://5.79.249.77:6969/announce"
                    }, {"tier": 192, "url": "udp://185.5.97.139:8089/announce"}, {
                        "tier": 193,
                        "url": "udp://194.106.216.222:80/announce"
                    }, {"tier": 194, "url": "udp://91.218.230.81:6969/announce"}, {
                        "tier": 195,
                        "url": "https://104.28.17.69/announce"
                    }, {"tier": 196, "url": "http://104.28.16.69/announce"}, {
                        "tier": 197,
                        "url": "http://185.5.97.139:8089/announce"
                    }, {"tier": 198, "url": "http://194.106.216.222/announce"}, {
                        "tier": 199,
                        "url": "http://80.246.243.18:6969/announce"
                    }, {"tier": 200, "url": "http://37.19.5.139:6969/announce"}, {
                        "tier": 201,
                        "url": "udp://5.79.83.193:6969/announce"
                    }, {"tier": 202, "url": "udp://46.4.109.148:6969/announce"}, {
                        "tier": 203,
                        "url": "udp://51.254.244.161:6969/announce"
                    }, {"tier": 204, "url": "udp://188.165.253.109:1337/announce"}, {
                        "tier": 205,
                        "url": "http://91.217.91.21:3218/announce"
                    }, {"tier": 206, "url": "http://37.19.5.155:6881/announce"}, {
                        "tier": 207,
                        "url": "http://46.4.109.148:6969/announce"
                    }, {"tier": 208, "url": "http://51.254.244.161:6969/announce"}, {
                        "tier": 209,
                        "url": "http://104.28.1.30:8080/announce"
                    }, {"tier": 210, "url": "http://81.200.2.231/announce"}, {
                        "tier": 211,
                        "url": "http://157.7.202.64:8080/announce"
                    }, {"tier": 212, "url": "http://87.248.186.252:8080/announce"}, {
                        "tier": 213,
                        "url": "udp://128.199.70.66:5944/announce"
                    }, {"tier": 214, "url": "udp://182.176.139.129:6969/announce"}, {
                        "tier": 215,
                        "url": "http://128.199.70.66:5944/announce"
                    }, {"tier": 216, "url": "http://188.165.253.109:1337/announce"}, {
                        "tier": 217,
                        "url": "http://93.92.64.5/announce"
                    }, {"tier": 218, "url": "http://173.254.204.71:1096/announce"}, {
                        "tier": 219,
                        "url": "udp://195.123.209.40:80/announce"
                    }, {"tier": 220, "url": "udp://62.212.85.66:2710/announce"}, {
                        "tier": 221,
                        "url": "udp://208.67.16.113:8000/announce"
                    }, {"tier": 222, "url": "http://125.227.35.196:6969/announce"}, {
                        "tier": 223,
                        "url": "http://59.36.96.77:6969/announce"
                    }, {"tier": 224, "url": "http://87.253.152.137/announce"}, {
                        "tier": 225,
                        "url": "http://158.69.146.212:7777/announce"
                    }, {"tier": 226, "url": "udp://tracker.coppersurfer.tk:6969/announce"}, {
                        "tier": 227,
                        "url": "udp://zer0day.ch:1337/announce"
                    }, {"tier": 228, "url": "udp://tracker.leechers-paradise.org:6969/announce"}, {
                        "tier": 229,
                        "url": "udp://9.rarbg.com:2710/announce"
                    }, {"tier": 230, "url": "udp://p4p.arenabg.com:1337/announce"}, {
                        "tier": 231,
                        "url": "udp://tracker.sktorrent.net:6969/announce"
                    }, {"tier": 232, "url": "udp://tracker.aletorrenty.pl:2710/announce"}, {
                        "tier": 233,
                        "url": "udp://tracker.kicks-ass.net:80/announce"
                    }, {"tier": 234, "url": "udp://torrent.gresille.org:80/announce"}, {
                        "tier": 235,
                        "url": "udp://tracker.skyts.net:6969/announce"
                    }, {"tier": 236, "url": "udp://tracker.yoshi210.com:6969/announce"}, {
                        "tier": 237,
                        "url": "udp://tracker.tiny-vps.com:6969/announce"
                    }, {"tier": 238, "url": "udp://tracker.internetwarriors.net:1337/announce"}, {
                        "tier": 239,
                        "url": "udp://mgtracker.org:2710/announce"
                    }, {"tier": 240, "url": "udp://tracker.filetracker.pl:8089/announce"}, {
                        "tier": 241,
                        "url": "udp://tracker.ex.ua:80/announce"
                    }, {"tier": 242, "url": "udp://91.218.230.81:6969/announce"}, {
                        "tier": 243,
                        "url": "udp://tracker.grepler.com:6969/announce"
                    }, {"tier": 244, "url": "udp://tracker.flashtorrents.org:6969/announce"}, {
                        "tier": 245,
                        "url": "udp://tracker.bittor.pw:1337/announce"
                    }, {"tier": 246, "url": "udp://tracker.kuroy.me:5944/announce"}, {
                        "tier": 247,
                        "url": "udp://182.176.139.129:6969/announce"
                    }, {"tier": 248, "url": "udp://open.stealth.si:80/announce"}, {
                        "tier": 249,
                        "url": "udp://208.67.16.113:8000/announce"
                    }, {"tier": 250, "url": "udp://tracker.coppersurfer.tk:6969/announce"}, {
                        "tier": 251,
                        "url": "http://tracker.opentrackr.org:1337/announce"
                    }, {"tier": 252, "url": "udp://zer0day.ch:1337/announce"}, {
                        "tier": 253,
                        "url": "http://explodie.org:6969/announce"
                    }, {"tier": 254, "url": "udp://tracker.leechers-paradise.org:6969/announce"}, {
                        "tier": 255,
                        "url": "udp://9.rarbg.com:2710/announce"
                    }, {"tier": 256, "url": "udp://p4p.arenabg.com:1337/announce"}, {
                        "tier": 257,
                        "url": "udp://tracker.sktorrent.net:6969/announce"
                    }, {"tier": 258, "url": "http://p4p.arenabg.com:1337/announce"}, {
                        "tier": 259,
                        "url": "udp://tracker.aletorrenty.pl:2710/announce"
                    }, {"tier": 260, "url": "http://tracker.aletorrenty.pl:2710/announce"}, {
                        "tier": 261,
                        "url": "http://tracker.bittorrent.am/announce"
                    }, {"tier": 262, "url": "udp://tracker.kicks-ass.net:80/announce"}, {
                        "tier": 263,
                        "url": "http://tracker.kicks-ass.net/announce"
                    }, {"tier": 264, "url": "http://tracker.baravik.org:6970/announce"}, {
                        "tier": 265,
                        "url": "udp://tracker.piratepublic.com:1337/announce"
                    }, {"tier": 266, "url": "udp://213.163.67.56:1337/announce"}, {
                        "tier": 267,
                        "url": "http://213.163.67.56:1337/announce"
                    }, {"tier": 268, "url": "udp://185.86.149.205:1337/announce"}, {
                        "tier": 269,
                        "url": "http://74.82.52.209:6969/announce"
                    }, {"tier": 270, "url": "udp://94.23.183.33:6969/announce"}, {
                        "tier": 271,
                        "url": "udp://74.82.52.209:6969/announce"
                    }, {"tier": 272, "url": "udp://151.80.120.114:2710/announce"}, {
                        "tier": 273,
                        "url": "udp://109.121.134.121:1337/announce"
                    }, {"tier": 274, "url": "udp://168.235.67.63:6969/announce"}, {
                        "tier": 275,
                        "url": "http://109.121.134.121:1337/announce"
                    }, {"tier": 276, "url": "udp://178.33.73.26:2710/announce"}, {
                        "tier": 277,
                        "url": "http://178.33.73.26:2710/announce"
                    }, {"tier": 278, "url": "http://85.17.19.180/announce"}, {
                        "tier": 279,
                        "url": "udp://85.17.19.180:80/announce"
                    }, {"tier": 280, "url": "http://210.244.71.25:6969/announce"}, {
                        "tier": 281,
                        "url": "http://85.17.19.180/announce"
                    }]], "id": 75
            }
            , callback);
    }

    function addTorrent(magnet, dlPath, callback) {
        console.log("Adding: " + magnet);
        var config = {
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
        var isObj = function (obj) {
            return obj !== undefined && obj !== null && obj.constructor == Object;
        }
        config = (isObj(dlPath) ? dlPath : config);
        post({
            method: 'web.add_torrents',
            params: [[{
                path: magnet,
                options: config
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

    function getTorrentRecord(callback) {
        post({
            method: 'web.update_ui',
            params: [[
                'queue',
                'name',
                'total_wanted',
                'state',
                'progress',
                'num_seeds',
                'total_seeds',
                'num_peers',
                'total_peers',
                'download_payload_rate',
                'upload_payload_rate',
                'eta',
                'ratio',
                'distributed_copies',
                'is_auto_managed',
                'time_added',
                'tracker_host',
                'save_path',
                'total_done',
                'total_uploaded',
                'max_download_speed',
                'max_upload_speed',
                'seeds_peers_ratio'
            ], {}]
        }, callback);
    }

})();
