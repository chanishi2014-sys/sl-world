/* Unused metric-to-screen projection. The live 006 viewer still draws legacy coordinates. */
(() => {
 'use strict';
 function createMetricProjection({park=SL_FIELDING.standardPark,layout=SL_FIELDING.metricLayout,width=800,height=500,margin={left:40,right:40,top:30,bottom:50}}={}){
  if(park.coordinateSpace!==layout.coordinateSpace||layout.coordinateSpace!=='baseball-metric-v1')throw Error('unsupported coordinateSpace for metric projection');
  const {left,right,top,bottom}=margin;
  if(![width,height,left,right,top,bottom].every(Number.isFinite)||width<=left+right||height<=top+bottom||Math.min(left,right,top,bottom)<0)throw Error('invalid screen bounds');
  const points=[...layout.bases,...park.fencePolyline];
  if(!points.length||points.some(p=>!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite)))throw Error('invalid metric geometry');
  const minX=Math.min(...points.map(p=>p[0])),maxX=Math.max(...points.map(p=>p[0])),minY=Math.min(...points.map(p=>p[1])),maxY=Math.max(...points.map(p=>p[1]));
  if(minY<0||maxY<=0)throw Error('metric geometry does not fit the home-anchored view');
  const homeScreenX=width/2,homeScreenY=height-bottom;
  const scaleX=Math.min(minX<0?(homeScreenX-left)/-minX:Infinity,maxX>0?(width-right-homeScreenX)/maxX:Infinity);
  const scaleY=(homeScreenY-top)/maxY,scale=Math.min(scaleX,scaleY);
  if(!Number.isFinite(scale)||scale<=0)throw Error('invalid metric projection scale');
  function worldToScreen({coordinateSpace,point}){
   if(coordinateSpace!==layout.coordinateSpace)throw Error('unsupported coordinateSpace for worldToScreen');
   if(!Array.isArray(point)||point.length!==2||!point.every(Number.isFinite))throw Error('invalid world point');
   return [homeScreenX+point[0]*scale,homeScreenY-point[1]*scale];
  }
  return Object.freeze({coordinateSpace:layout.coordinateSpace,width,height,margin:Object.freeze({...margin}),homeScreenX,homeScreenY,scale,worldToScreen});
 }
 globalThis.SL_METRIC_SCREEN=Object.freeze({createMetricProjection});
})();
