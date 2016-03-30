/*
 * Copyright (C) 2001-2016 Food and Agriculture Organization of the
 * United Nations (FAO-UN), United Nations World Food Programme (WFP)
 * and United Nations Environment Programme (UNEP)
 *
 * This program is free software; you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation; either version 2 of the License, or (at
 * your option) any later version.
 *
 * This program is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program; if not, write to the Free Software
 * Foundation, Inc., 51 Franklin St, Fifth Floor, Boston, MA 02110-1301, USA
 *
 * Contact: Jeroen Ticheler - FAO - Viale delle Terme di Caracalla 2,
 * Rome - Italy. email: geonetwork@osgeo.org
 */

(function() {
  goog.provide('gn_featurestable_loader');

  var module = angular.module('gn_featurestable_loader', []);

  geonetwork.inherits = function(childCtor, parentCtor) {
    function tempCtor() {
    };
    tempCtor.prototype = parentCtor.prototype;
    childCtor.superClass_ = parentCtor.prototype;
    childCtor.prototype = new tempCtor();
    childCtor.prototype.constructor = childCtor;
  };



  /**
   * @abstract
   * @constructor
   */
  geonetwork.GnFeaturesLoader = function(config, $injector) {
    this.$injector = $injector;
    this.$http = this.$injector.get('$http');
    this.gnProxyUrl =  this.$injector.get('gnGlobalSettings').proxyUrl;

    this.layer = config.layer;
    this.map = config.map;

    this.excludeCols = [];
  };
  geonetwork.GnFeaturesLoader.prototype.load = function(){};
  geonetwork.GnFeaturesLoader.prototype.loadAll = function(){};
  geonetwork.GnFeaturesLoader.prototype.getBsTableConfig = function(){};

  geonetwork.GnFeaturesLoader.prototype.proxyfyUrl = function(url){
    return this.gnProxyUrl + encodeURIComponent(url);
  };

  /**
   *
   * @constructor
   */
  geonetwork.GnFeaturesGFILoader = function(config, $injector) {

    geonetwork.GnFeaturesLoader.call(this, config, $injector);

    this.coordinates = config.coordinates;
  };

  geonetwork.inherits(geonetwork.GnFeaturesGFILoader,
      geonetwork.GnFeaturesLoader);

  geonetwork.GnFeaturesGFILoader.prototype.loadAll = function() {
    var layer = this.layer,
        map = this.map,
        coordinates = this.coordinates;

    var uri = layer.getSource().getGetFeatureInfoUrl(coordinates,
        map.getView().getResolution(),
        map.getView().getProjection(), {
          INFO_FORMAT: layer.ncInfo ? 'text/xml' :
              'application/vnd.ogc.gml'
        });

    var proxyUrl = this.proxyfyUrl(uri);
    return this.$http.get(proxyUrl).then(function(response) {
      var format = new ol.format.WMSGetFeatureInfo();
      var features = format.readFeatures(response.data);
      this.features = features;
      return features;
    }.bind(this));

  };

  geonetwork.GnFeaturesGFILoader.prototype.getBsTableConfig = function() {
    return this.loadAll().then(function(features) {

      if (!features || features.length == 0) {
        return;
      }
      var columns = Object.keys(features[0].getProperties()).map(function(x) {
        return {
          field: x,
          title: x
        };
      });

      return  {
        columns: columns,
        data: features.map(function(f) { return f.getProperties() })
      };
    });
  };


  geonetwork.GnFeaturesGFILoader.prototype.getCount = function() {
    if (!this.features) {
      return 0;
    }
    return this.features.length;
  };

  /**
   *
   * @constructor
   */
  geonetwork.GnFeaturesSOLRLoader = function(config, $injector) {
    geonetwork.GnFeaturesLoader.call(this, config, $injector);

    this.layer = config.layer;
    this.coordinates = config.coordinates;
    this.solrObject = config.solrObject;
  };

  geonetwork.inherits(geonetwork.GnFeaturesSOLRLoader,
      geonetwork.GnFeaturesLoader);

  geonetwork.GnFeaturesSOLRLoader.prototype.getBsTableConfig = function() {
    var $q = this.$injector.get('$q');
    var defer = $q.defer();

    var pageList = [5, 10, 50, 100],
        columns = [],
        solr = this.solrObject,
        map = this.map,
        fields = solr.filteredDocTypeFieldsInfo;

    fields.forEach(function(field) {
      if ($.inArray(field.idxName, this.excludeCols) === -1) {
        columns.push({
          field: field.idxName,
          title: field.label
        });
      }
    });

    // get an update solr request url with geometry filter based on a point
    var url = this.coordinates ?
        this.solrObject.getMergedRequestUrl({}, {
          pt: ol.proj.transform(this.coordinates,
            map.getView().getProjection(), 'EPSG:4326').reverse().join(','),
          //5 pixels radius tolerance
          d: map.getView().getResolution() / 400,
          sfield: solr.geomField.idxName
        }) + '&fq={!geofilt sfield=' + solr.geomField.idxName + '}' :
        this.solrObject.baseUrl;

    url = url.replace('rows=0', '');
    if (url.indexOf('&q=') === -1) {
      url += '&q=*:*';
    }
    defer.resolve({
      url: url,
      queryParams: function(p) {
        return {
          rows: p.limit,
          start: p.offset
        };
      },
      //data: scope.data.response.docs,
      responseHandler: function(res) {
        return {
          total: res.response.numFound,
          rows: res.response.docs
        };
      },
      columns: columns,
      pagination: true,
      sidePagination: 'server',
      totalRows: this.solrObject.totalCount,
      pageSize: pageList[0],
      pageList: pageList
    });
    return defer.promise;
  };

  geonetwork.GnFeaturesSOLRLoader.prototype.getGeomFromRow = function(row) {
    var geom = row[this.solrObject.geomField.idxName];
    if(angular.isArray(geom)) {
      geom = geom[0];
    }
    geom = new ol.format.WKT().readFeature(geom, {
      dataProjection: 'EPSG:4326',
      featureProjection: this.map.getView().getProjection()
    });
    return geom;
  };



  /**
   *
   * @constructor
   */
  var GnFeaturesTableLoaderService = function($injector) {
    this.$injector = $injector;
  };
  GnFeaturesTableLoaderService.prototype.createLoader = function(type, config) {
    var constructor = geonetwork['GnFeatures' + type.toUpperCase() + 'Loader'];
    if(!angular.isFunction(constructor)) {
      console.warn('Cannot find constructor for loader type : ' + type);
    }
    return new constructor(config, this.$injector);
  };
  module.service('gnFeaturesTableLoader', [
    '$injector',
    GnFeaturesTableLoaderService]);

})();
