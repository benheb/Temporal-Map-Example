      dojo.require("esri.map");
      dojo.require("dojo.io.script");
      dojo.require("esri.layers.FeatureLayer");      
      dojo.require("dijit.TooltipDialog");
      //dojo.require("esri.dijit.TimeSlider");
      dojo.require("myModules.TimeSliderGeoiqExt");


      var timeSlider; 
      var crimeLayer;
      
      function init() {
        var startExtent = new esri.geometry.Extent({"xmin":-8381753.575299095,"ymin":4864602.340301298,"xmax":-8342635.093809094,"ymax":4896425.59837099,"spatialReference":{"wkid":102100}});
        var map = new esri.Map("map", {extent:startExtent});
        
        var layers = [];
        var basemap = new esri.layers.ArcGISTiledMapServiceLayer("http://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer");
        layers.push(basemap);

        crimeLayer = new esri.layers.FeatureLayer("http://ec2-23-22-185-186.compute-1.amazonaws.com:6080/arcgis/rest/services/PhillyCrime/MapServer/0"
                                                        , { mode: esri.layers.FeatureLayer.MODE_SNAPSHOT
                                                           , outFields: ["UCRHundred", "STOLEN_VALUE", "RECOVERED_VALUE", "LOCATION", "STATUS", "MODUS_OPERANDI"] });
        
        crimeLayer.maxRecordCount = 100000;

        // Styling the Categories
        var markerOpacity = 180;
        
        var categoryColors = {red: [215, 0, 0, markerOpacity], green: [34, 150, 94, markerOpacity], blue: [51, 137, 186, markerOpacity]}
        var categories = [{code: 100, label: "Homicide", color: "red"},
                          {code: 200, label: "Sexual Assault", color: "red"},
                          {code: 300, label: "Robbery", color: "blue"},
                          {code: 400, label: "Assault", color: "red"},
                          {code: 500, label: "Burglary", color: "green"},
                          {code: 600, label: "Theft", color: "green"},
                          {code: 700, label: "Stolen Vehicle", color: "green"}];

        var renderer = new esri.renderer.UniqueValueRenderer({type: "uniqueValue",
                                                              field1: "UCRHundred",
                                                              defaultSymbol: {
                                                                color: [0, 0, 0, 64],
                                                                outline: {color: [255, 255, 255, 255], width: 1, type: "esriSMS", style: "esriSMSNull"},
                                                                type: "esriSMS",
                                                                style: "esriSMSCircle"
                                                              }});
        dojo.map(categories, function(category, i) {
            renderer.addValue({
                value: category.code,
                label: category.label,
                symbol: { 
                    color: categoryColors[category.color],
                    outline: {color: [255, 255, 255, 255], width: 1, type: "esriSMS", style: "esriSMSCircle"},
                    type: "esriSMS",
                    style: "esriSMSCircle"} 
            });
        });
        crimeLayer.setRenderer(renderer);
        // end categorical styling
        layers.push(crimeLayer);

        //add all the layers to the map then initialize the slider
        map.addLayers(layers);
        dojo.connect(map,"onLayersAddResult",initSlider);

        
        // var highlightSymbol = new esri.symbol.SimpleMarkerSymbol(esri.symbol.SimpleMarkerSymbol.STYLE_SOLID, 10,
        //                            new esri.symbol.SimpleLineSymbol(esri.symbol.SimpleLineSymbol.STYLE_SOLID,
        //                            new dojo.Color([255,0,0]), 1),
        //                            new dojo.Color([0,255,0,0.25]));



        //listen for when the onMouseOver event fires on the countiesGraphicsLayer
        //when fired, create a new graphic with the geometry from the event.graphic and add it to the maps graphics layer
        dojo.connect(crimeLayer, "onMouseOver", openDialog);
        dojo.connect(crimeLayer, "onMouseOut", closeDialog);
        
        //total count for mapservicelayer
         var targetNode = dojo.byId("totalcount");
         var getTotalCount = {
           url: "http://ec2-23-22-185-186.compute-1.amazonaws.com:6080/arcgis/rest/services/PhillyCrime/MapServer/0/query?where=1=1&f=json&returnCountOnly=true", 
           callbackParamName: "callback",
           content: {
             v: "1.0",
             q: "dojo toolkit"
           },
           load: function(data){
             console.log("Map Service Layer", data)
             targetNode.innerHTML = "<pre>" + data['count'] + "</pre>";
           }
         };
         dojo.io.script.get(getTotalCount);
      }
      function openDialog(evt){
        closeDialog();

        var dialog = new dijit.TooltipDialog({
          id: "tooltipDialog",
          style: "position: absolute; width: 250px; font: normal normal normal 10pt Helvetica;z-index:100"
        });
        dialog.startup();

        var t = "<b>${UCRHundred}</b><hr><b>Stolen Value: </b>${STOLEN_VALUE:NumberFormat}<br/>"
                         + "<b>Recovered Value: </b>${RECOVERED_VALUE:NumberFormat}<br/>"
                         + "<b>Locations: </b>${LOCATIONS}";

        var content = esri.substitute(evt.graphic.attributes,t);

        // var highlightGraphic = new esri.Graphic(evt.graphic.geometry,highlightSymbol);
        // map.graphics.add(highlightGraphic);

        dialog.setContent(content);

        dojo.style(dialog.domNode, "opacity", 0.85);
        dijit.popup.open({popup: dialog, x:evt.pageX,y:evt.pageY});

      }
      function closeDialog() {
        var widget = dijit.byId("tooltipDialog");
        if (widget) {
          widget.destroy();
        }
      }
      
      // Called after the FeatureLayer finishes loading.
      function initSlider(results) {
        var map = this;
        console.log(results)
        timeSlider = new myModules.TimeSliderGeoiqExt({style: "width: 760px;"},dojo.byId("timeSliderDiv"));
        map.setTimeSlider(timeSlider);
        
        var timeExtent = new esri.TimeExtent();
        timeExtent.startTime = new Date("2002/06/01 00:04:00 UTC");
        timeExtent.endTime = new Date("2002/06/29 23:59:00 UTC");
        timeSlider.setThumbCount(2);
        timeSlider.createTimeStopsByTimeInterval(timeExtent,7,'esriTimeUnitsHours');
        timeSlider.setThumbIndexes([0,5]);
        timeSlider.setThumbMovingRate(200);
        timeSlider.numberBins = timeSlider.timeStops.length-1;
        timeSlider.bins = [];
        timeSlider.startup();
        
        //total bins: 
        dojo.byId("totalbins").innerHTML = timeSlider.timeStops.length-1;

        //wait until features array as length, then calculate bins
        setTimeout(function(){
          if (!crimeLayer.graphics.length){
            setTimeout(arguments.callee, 25);
            return;
          } 
          // else 
          calculateBins();
        }, 0)
        
        //add labels for every other time stop
        /*var labels = dojo.map(timeSlider.timeStops, function(timeStop,i){ 
          if(i%2 === 0){
            return timeStop.getUTCHours(); }
          else{
            return "";
          }
        });*/      
        labels = null;
        timeSlider.setLabels(labels);
        
        dojo.connect(timeSlider, "onTimeExtentChange", function(timeExtent) {
          var startValString = timeExtent.startTime.getUTCFullYear();
          var endValString = timeExtent.endTime.getUTCFullYear();
          //dojo.byId("daterange").innerHTML = "<i>" + startValString + " and " + endValString  + "<\/i>";
        });
      }
      
      function calculateBins() {
        var timeStops = [];
        var times = [];
        for(i=0;i<timeSlider.timeStops.length-1;i++) {
          timeStops[i] = timeSlider.timeStops[i].getTime();
          timeSlider.bins.push({"count": 0, "timestamp": timeSlider.timeStops[i], 'utc': timeStops[i]});
        }
        
        var features = crimeLayer.graphics;
        var test = 0;
        var first_time = timeStops[0];
        for(var i=0;i<features.length;i++) {
          var fTime =  features[i].attributes.DISPATCH_DATE_TIME;
          for(var j=0;j<=timeStops.length;j++) {
            if (j != timeStops.length - 1) {
              if (fTime >= first_time && fTime <= timeStops[j]) {
                timeSlider.bins[j-1].count++;
              };
            } else {
              if (fTime >= first_time && fTime <= timeStops[j]) {
                timeSlider.bins[j-1].count++;
              };
            }
            if(j == timeStops.length) {
              if(fTime >= timeStops[timeStops.length]) timeSlider.bins[j-1].count++;
            }
            first_time = timeStops[j];
          };
        };
        
        //init slider
        timeSlider.initSlider()
      }
      
      function updateSlider() {
          dojo.connect(timeSlider, "onTimeExtentChange", function(timeExtent) {
          console.log('timeExtent', timeExtent);
        });
          
       }
      
      dojo.addOnLoad(init);