'use strict';
var logme = require('logme');
var forecastClient = require('asthma-forecast')();
var twilio = require('twilio');
var async = require('async');
var subscriberModel = require('../models/subscriber');
var email = require('../email');

var eachSubscriptionForecast = function (method, iteratee, callback) {
    var done = false;
    var pageCount = 0;
    var pagingToken = null;
    async.whilst(
        function () { return !done; },
        function (nextPage) {
            subscriberModel.list(method, 2, pagingToken, function (err, subscribers, nextToken) {
                if (err) {
                    logme.error('Error listing page ' + pageCount + ' subscribers by ' + method + ': ' + err);
                    return nextPage(err);
                }

                pageCount++;
                async.eachLimit(subscribers, 1, function (subscriber, nextSubscriber) {

                    // get the forecast by zip
                    forecastClient.getForecastByZipCode(subscriber.zip, function (err, forecast) {
                        if (err) {
                            logme.error('Error fetching forecast for zip ' + subscriber.zip + ': ' + err);
                            nextSubscriber();
                        } else {
                            logme.info('Successful forecast for ' + subscriber.to + ' for zip ' + subscriber.zip);
                            iteratee(subscriber, forecast, nextSubscriber);
                        }
                    });
                }, function (err) {
                    if (err) {
                        logme.error('Error listing page ' + pageCount + ' subscribers by ' + method + ': ' + err);
                        pagingToken = false;
                        return nextPage(err);
                    }

                    pagingToken = nextToken;
                    if (nextToken === false) {
                        done = true;
                    }
                    nextPage();
                });
            });
        }, callback);
}

module.exports = function (app) {

    // email cron task
    app.get('/tasks/email', function (req, res, next) {
        if (req.get('X-Appengine-Cron') != true) {
            logme.info('Illegal CRON request from the internets');
            //res.sendStatus(200);
            //return;
        }

        eachSubscriptionForecast('email', function (subscriber, forecast, nextSubscriber) {
            if (!forecast.properties) {
                logme.error('missing forecast.properties: ' + forecast);
                return nextSubscriber();
            }
            if (forecast.properties.code === 'low') {
                logme.debug('skipping good forecast: ');
                return nextSubscriber();
            }

            email.sendForecast(subscriber.to, forecast.properties.code, subscriber.zip, function(err) {
                nextSubscriber();
            });
        }, function (err) {
            if (err) {
                logme.error('Error processing subscribers by email: ' + err);
            }
        });

        res.sendStatus(200);
    });

    // sms cron task
    app.get('/tasks/sms', function (req, res, next) {
        if (req.get('X-Appengine-Cron') != true) {
            logme.info('Illegal CRON request from the internets');
            //res.sendStatus(200);
            //return;
        }
        
        eachSubscriptionForecast('sms', function (subscriber, forecast, nextSubscriber) {
            if (!forecast.properties) {
                logme.error('missing forecast.properties: ' + forecast);
                return nextSubscriber();
            }
            if (forecast.properties.codes === 'low') {
                // logme.debug('skipping good forecast: ');
                return nextSubscriber();
            }

            sms.sendForecast(subscriber.to, forecast.properties.code, subscriber.zip, function(err) {
                nextSubscriber();
            });
        }, function (err) {
            if (err) {
                logme.error('Error processing subscribers by sms: ' + err);
            }
        });
    
        res.sendStatus(200);
    });

};
