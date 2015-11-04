var module = angular.module('DomainFactory', [ ]);

module.factory('DomainFactory', [ '$q', '$http', function($q, $http) {
    function _testDomain(domain, bundleIdentifier, teamIdentifier) {
        var requestUrl = '/domain/' + domain;

        if (bundleIdentifier) {
            requestUrl += '?bundleIdentifier=' + bundleIdentifier;

            // Only try this if bundle identifier is present
            if (teamIdentifier) {
                requestUrl += '&teamIdentifier=' + teamIdentifier;
            }
        }

        return $q(function(resolve, reject) {
            $http.post(requestUrl)
                .then(function(response) {
                    resolve(response.data.domains);
                }, function(response) {
                    var respObj = response.data;

                    if (!respObj) {
                        reject('A server error occurred while processing your request');
                    }
                    else {
                        resolve(respObj.domains);
                    }
                });
        });
    }

    function _testApp(appname, appFormData) {
        return $q(function(resolve, reject) {
            $http({
                url: '/app/' + appname,
                method: 'POST',
                data: appFormData,
                headers: { 'Content-Type': undefined }
            })
            .then(function(response) {
                resolve(response.data);
            }, function(response) {
                var respObj = response.data;

                if (!respObj) {
                    reject('A server error occurred while processing your request');
                }
                else {
                    resolve(respObj);
                }
            });
        });
    }

    return {
        testDomain: _testDomain,
        testApp: _testApp
    };
}]);
