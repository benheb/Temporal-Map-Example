      dojo.require("esri.map");
      dojo.require("esri.dijit.TimeSlider");

		  var timeSlider; 
      
      function init() {
        var startExtent = new esri.geometry.Extent({"xmin":-8381753.575299095,"ymin":4864602.340301298,"xmax":-8342635.093809094,"ymax":4896425.59837099,"spatialReference":{"wkid":102100}});
        var map = new esri.Map("map", {extent:startExtent});
        
        var layers = [];
        var basemap = new esri.layers.ArcGISTiledMapServiceLayer("http://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer");
        layers.push(basemap);

        var crimeLayer= new esri.layers.ArcGISDynamicMapServiceLayer("http://ec2-23-22-185-186.compute-1.amazonaws.com:6080/arcgis/rest/services/PhillyCrime/MapServer");
        crimeLayer.setVisibleLayers([0]);
        console.log('opLayer', crimeLayer)
        
        layers.push(crimeLayer);

        //add all the layers to the map then initialize the slider
        map.addLayers(layers);

        //flUpdateEndConnectHandle = dojo.connect(opLayer, "onUpdateEnd", updateSlider);

        dojo.connect(map,"onLayersAddResult",initSlider);
        
        //Test queries!
        //total count for mapservicelayer
        //var testLayer = new esri.layers.ArcGISDynamicMapServiceLayer("http://ec2-23-22-185-186.compute-1.amazonaws.com:6080/arcgis/rest/services/PhillyCrime/MapServer/0/query?where=1=1&returnCountOnly=true&f=json");
        //console.log('testLayer', testLayer)
      }

      function initSlider(results) {
        var map = this;
        timeSlider = new esri.dijit.TimeSlider({style: "width: 1000px;"},dojo.byId("timeSliderDiv"));
        map.setTimeSlider(timeSlider);
        
        var timeExtent = new esri.TimeExtent();
        timeExtent.startTime = new Date("2002/06/01 00:04:00 UTC");
        timeExtent.endTime = new Date("2002/06/29 23:59:00 UTC");
        timeSlider.setThumbCount(2);
        timeSlider.createTimeStopsByTimeInterval(timeExtent,2,'esriTimeUnits');
        timeSlider.setThumbIndexes([0,1]);
        timeSlider.setThumbMovingRate(2000);
        timeSlider.startup();
        
        console.log('timeSlider', timeSlider);
        
        //add labels for every other time stop
        var labels = dojo.map(timeSlider.timeStops, function(timeStop,i){ 
          if(i%2 === 0){
            return timeStop.getUTCFullYear(); }
          else{
            return "";
          }
        });      
        
        timeSlider.setLabels(labels);
        
        dojo.connect(timeSlider, "onTimeExtentChange", function(timeExtent) {
          var startValString = timeExtent.startTime.getUTCFullYear();
          var endValString = timeExtent.endTime.getUTCFullYear();
          dojo.byId("daterange").innerHTML = "<i>" + startValString + " and " + endValString  + "<\/i>";
        });
      }
      
      function updateSlider() {
          dojo.connect(timeSlider, "onTimeExtentChange", function(timeExtent) {
          console.log('timeExtent', timeExtent);
        });
          
       }
      
      dojo.addOnLoad(init);