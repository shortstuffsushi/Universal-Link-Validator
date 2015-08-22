var module = angular.module('DomainFactory', [ ]);

module.factory('DomainFactory', [ '$q', '$http', function($q, $http) {
    function _testDomain(domain) {
        return $q(function(resolve, reject) {
            $http.post('/domain/' + domain)
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

    function _testApp(appFormData) {
        return $q(function(resolve, reject) {
            $http({
                url: '/app',
                method: 'POST',
                data: appFormData,
                headers: { 'Content-Type': undefined }
            })
            .then(function(response) {
                    resolve(response);
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

    return {
        testDomain: _testDomain,
        testApp: _testApp
    };
}]);
