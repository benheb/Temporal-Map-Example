      dojo.require("esri.map");
      dojo.require("esri.dijit.TimeSlider");
      dojo.require("esri.layers.FeatureLayer");

		  var timeSlider, crimeLayer, map; 
      
      function init() {
        var startExtent = new esri.geometry.Extent({"xmin":-8381753.575299095,"ymin":4864602.340301298,"xmax":-8342635.093809094,"ymax":4896425.59837099,"spatialReference":{"wkid":102100}}),
        layers = [],
        basemap;
        map = new esri.Map("map", {extent:startExtent});
        basemap = new esri.layers.ArcGISTiledMapServiceLayer("http://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer");
        layers.push(basemap);

        crimeLayer= new esri.layers.FeatureLayer("http://ec2-23-22-185-186.compute-1.amazonaws.com:6080/arcgis/rest/services/PhillyCrime/MapServer/0",{
					mode:esri.layers.FeatureLayer.MODE_SNAPSHOT
        });
        crimeLayer.maxRecordCount = 100000;
        console.log('opLayer', crimeLayer);
        
        layers.push(crimeLayer);

        //add all the layers to the map
        map.addLayers(layers);
        
        //then initialize the slider when all graphics loaded into featureLayer
        dojo.connect(crimeLayer, "onUpdateEnd", function(error, results){
					if (! timeSlider){
						initSlider();
					}
        });
      }

      function initSlider(error, results) {
        timeSlider = new esri.dijit.TimeSlider({style: "width: 1000px;"},dojo.byId("timeSliderDiv"));
        map.setTimeSlider(timeSlider);
        
        var timeExtent = new esri.TimeExtent();
        timeExtent.startTime = new Date("2002/06/01 00:04:00 UTC");
        timeExtent.endTime = new Date("2002/06/29 23:59:00 UTC");
        timeSlider.setThumbCount(2);
        timeSlider.createTimeStopsByTimeInterval(timeExtent,2,'esriTimeUnitsDays');
        timeSlider.setThumbIndexes([0,1]);
        timeSlider.setThumbMovingRate(2000);
        timeSlider.startup();
        
        //add labels for every other time stop
        var labels = dojo.map(timeSlider.timeStops, function(timeStop,i){
					var s = ""; 
          if(i%2 === 0){
            s = timeStop.getDate(); 
          }
          return s;
        });      
        timeSlider.setLabels(labels);
        
        dojo.connect(timeSlider, "onTimeExtentChange", function(timeExtent) {
					//console.log(crimeLayer.getTimeDefinition());
					//console.log('timeSlider', timeSlider.getCurrentTimeExtent());
          var startValString = timeExtent.startTime.getDate();
          var endValString = timeExtent.endTime.getDate();
          dojo.byId("daterange").innerHTML = "<i>" + startValString + " and " + endValString  + "<\/i>";
        });
      }
      
      //loop through time stops on slider and get count of
      //features that are in each interval
      function showCrimeCounts(){
				var stops = timeSlider.timeStops,
				i,
				d1 = stops[0],
				d2,
				query = new esri.tasks.Query();
				query.where = "1=1";
				for (i = 1; i < stops.length; i++){
					d2 = stops[i];
					query.timeExtent = new esri.TimeExtent(d1,d2);
					crimeLayer.queryCount(query,showCount);
					d1 = d2;
				}
      }
      
      function showCount(count){
				console.log(count);
      }
      dojo.addOnLoad(init);