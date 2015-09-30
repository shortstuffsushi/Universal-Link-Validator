var module = angular.module('MainController', [ 'DomainFactory' ]);

module.controller('MainController', [ '$scope', 'DomainFactory', function($scope, domainFactory) {
    $scope.domains = { };
    $scope.domainInputVal = '';
    $scope.ipaInput = false;

    $scope.domainKeyUp = function(evt) {
        if (evt.keyCode == 13) {
            $scope.beginTest();
        }
    };

    $scope.cleanDomain = function() {
        var url = $scope.domainInputVal;
        url = url.replace(/https?:\/\//, '');
        url = url.replace(/\/.*/, '');
        $scope.domainInputVal = url;
    };

    $scope.beginTest = function() {
        if (!$scope.domainInputVal.length && !$scope.ipaInput) {
            alert('Domain or IPA required');
            return;
        }

        if ($scope.ipaInput) {
            var ipaFormData = new FormData();
            ipaFormData.append('ipa', $scope.ipaInput);

            domainFactory.testApp(ipaFormData)
                .then(function(domains) {
                    $scope.domains = domains;
                })
                .catch(function(err) {
                    alert(err);
                });
        }
        else {
            $scope.cleanDomain();

            domainFactory.testDomain($scope.domainInputVal)
                .then(function(domains) {
                    $scope.domains = domains;
                })
                .catch(function(err) {
                    alert(err);
                });
        }
    };

    $scope.listGroupItemClassForValue = function(badValue) {
        if (badValue === true) {
            return 'list-group-item-danger';
        }
        else if (badValue === false) {
            return 'list-group-item-success';
        }

        return 'disabled';
    };

    $scope.glyphiconClassForValue = function(badValue) {
        if (badValue === true) {
            return 'glyphicon-remove';
        }
        else if (badValue === false) {
            return 'glyphicon-ok';
        }

        return 'glyphicon-minus';
    };

    $scope.isEmpty = function(obj) {
        return obj === undefined || Object.keys(obj).length == 0;
    }

    $scope.prettyPrintAASA = function(aasa) {
        return JSON.stringify(aasa, null, 4);
    }
}]);
