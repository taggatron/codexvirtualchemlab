import * as THREE from './vendor/three.module.js';

const GLASS = () => new THREE.MeshPhysicalMaterial({color:0xccefff,transparent:true,opacity:.43,transmission:.6,roughness:.045,metalness:0,ior:1.46,thickness:.08,clearcoat:.35,clearcoatRoughness:.08,side:THREE.DoubleSide,depthWrite:false});
const metal = (color=0x687b82,roughness=.26) => new THREE.MeshStandardMaterial({color,metalness:.82,roughness});
const solid = (color,roughness=.46) => new THREE.MeshStandardMaterial({color,roughness,metalness:.05});

function shadowReady(root){root.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true}});return root}
function cylinder(r,h,mat,segments=40){return new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,segments),mat)}
function roundedBox(w,h,d,r=.035,smooth=4){const shape=new THREE.Shape(),hw=w/2-r,hh=h/2-r;shape.moveTo(-hw,-h/2);shape.lineTo(hw,-h/2);shape.quadraticCurveTo(w/2,-h/2,w/2,-hh);shape.lineTo(w/2,hh);shape.quadraticCurveTo(w/2,h/2,hw,h/2);shape.lineTo(-hw,h/2);shape.quadraticCurveTo(-w/2,h/2,-w/2,hh);shape.lineTo(-w/2,-hh);shape.quadraticCurveTo(-w/2,-h/2,-hw,-h/2);const geo=new THREE.ExtrudeGeometry(shape,{depth:Math.max(.001,d-r*2),bevelEnabled:true,bevelSegments:smooth,steps:1,bevelSize:r,bevelThickness:r,curveSegments:smooth*2});geo.center();return geo}

export class LabRenderer3D{
  constructor(canvas){
    this.canvas=canvas;this.available=false;this.signature='';this.flames=[];this.dynamic=[];this.width=1;this.height=1;this.left=0;this.top=0;this.coolantVisualLevel=0;this.coolantTransitionTarget=0;this.lastRenderTime=0;this.thermiteAfterglowUntil=0;this.thermiteGlowFraction=0;
    try{
      this.renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:true,powerPreference:'high-performance'});
      this.renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.12;
      this.scene=new THREE.Scene();this.scene.background=new THREE.Color(0xeaf1f2);this.scene.fog=new THREE.Fog(0xeaf1f2,13,24);
      this.camera=new THREE.PerspectiveCamera(36,1,.1,50);this.camera.position.set(0,4.65,8.55);this.camera.lookAt(0,1.05,0);
      this.root=new THREE.Group();this.scene.add(this.root);this.buildRoom();this.available=true;
    }catch(err){console.warn('WebGL renderer unavailable, retaining UI fallback.',err)}
  }
  buildRoom(){
    const hemi=new THREE.HemisphereLight(0xf5fbff,0x7d6d59,2.25);this.scene.add(hemi);
    const key=new THREE.DirectionalLight(0xffffff,3.1);key.position.set(-4,8,7);key.castShadow=true;key.shadow.mapSize.set(2048,2048);key.shadow.camera.left=-9;key.shadow.camera.right=9;key.shadow.camera.top=8;key.shadow.camera.bottom=-4;this.scene.add(key);
    const rim=new THREE.SpotLight(0x8edfff,16,18,.7,.5,1.1);rim.position.set(5,6,-2);rim.target.position.set(0,1,0);this.scene.add(rim,rim.target);
    const wall=new THREE.Mesh(new THREE.PlaneGeometry(16,8),solid(0xf2f7f7,.85));wall.position.set(0,3.8,-3);wall.receiveShadow=true;this.scene.add(wall);
    const gridMat=new THREE.LineBasicMaterial({color:0xb8c9cc,transparent:true,opacity:.42});const pts=[];for(let x=-8;x<=8;x+=.8)pts.push(x,0,-2.98,x,8,-2.98);for(let y=0;y<=8;y+=.8)pts.push(-8,y,-2.98,8,y,-2.98);const gridGeo=new THREE.BufferGeometry();gridGeo.setAttribute('position',new THREE.Float32BufferAttribute(pts,3));this.scene.add(new THREE.LineSegments(gridGeo,gridMat));
    const asphalt=document.createElement('canvas');asphalt.width=asphalt.height=256;const ac=asphalt.getContext('2d');ac.fillStyle='#12384d';ac.fillRect(0,0,256,256);let seed=4271;const rnd=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);for(let i=0;i<1450;i++){const light=rnd()>.55;ac.fillStyle=light?`rgba(127,178,194,${.08+rnd()*.18})`:`rgba(1,20,32,${.1+rnd()*.2})`;const r=.65+rnd()*2.25;ac.beginPath();ac.ellipse(rnd()*256,rnd()*256,r*1.45,r,0,0,Math.PI*2);ac.fill()}const asphaltMap=new THREE.CanvasTexture(asphalt);asphaltMap.wrapS=asphaltMap.wrapT=THREE.RepeatWrapping;asphaltMap.repeat.set(8,3.5);asphaltMap.colorSpace=THREE.SRGBColorSpace;asphaltMap.anisotropy=Math.min(8,this.renderer.capabilities.getMaxAnisotropy());const benchMat=new THREE.MeshStandardMaterial({map:asphaltMap,bumpMap:asphaltMap,bumpScale:.045,color:0x587b8b,roughness:.95,metalness:.03});
    const bench=new THREE.Mesh(new THREE.BoxGeometry(16,.55,7),benchMat);bench.position.set(0,-.28,.2);bench.receiveShadow=true;this.scene.add(bench);
    const edge=new THREE.Mesh(new THREE.BoxGeometry(16,.12,7.1),solid(0x28556a,.68));edge.position.set(0,.04,.18);edge.receiveShadow=true;this.scene.add(edge);
  }
  resize(left,top,width,height){width=Math.max(1,width);height=Math.max(1,height);const unchanged=this.left===left&&this.top===top&&this.width===width&&this.height===height;this.left=left;this.top=top;this.width=width;this.height=height;Object.assign(this.canvas.style,{left:`${left}px`,top:`${top}px`,width:`${width}px`,height:`${height}px`});if(!this.available||unchanged)return;this.renderer.setSize(width,height,false);this.camera.aspect=width/height;this.camera.updateProjectionMatrix()}
  projectToScreen(x,y,z){if(!this.available)return null;const p=new THREE.Vector3(x,y,z).project(this.camera);return {x:this.left+(p.x+1)*this.width/2,y:this.top+(1-p.y)*this.height/2}}
  posFromScreen(x,y){const ndc=new THREE.Vector2(((x-this.left)/this.width)*2-1,-(((y-this.top)/this.height)*2-1)),raycaster=new THREE.Raycaster();raycaster.setFromCamera(ndc,this.camera);const ray=raycaster.ray,t=Math.abs(ray.direction.y)>.0001?-ray.origin.y/ray.direction.y:0,point=ray.at(Math.max(0,t),new THREE.Vector3());point.y=0;return point}
  clear(){while(this.root.children.length){const o=this.root.children.pop();o.traverse?.(n=>{n.geometry?.dispose?.();if(Array.isArray(n.material))n.material.forEach(m=>m.dispose?.());else n.material?.dispose?.()})}this.flames=[];this.dynamic=[];this.pourAlignment=null;this.thermiteAfterglowUntil=0;this.thermiteGlowFraction=0}
  beaker(level=.42,color=0x3ca9d4){const g=new THREE.Group(),glassMat=new THREE.MeshPhysicalMaterial({color:0xd9f4ff,transparent:true,opacity:.48,transmission:.72,roughness:.025,metalness:0,ior:1.46,thickness:.11,clearcoat:1,clearcoatRoughness:.025,side:THREE.DoubleSide,depthWrite:false}),profile=[[0,.035],[.4,.035],[.54,.045],[.61,.085],[.655,.16],[.675,.31],[.69,1.22],[.7,1.34]].map(([x,y])=>new THREE.Vector2(x,y));const body=new THREE.Mesh(new THREE.LatheGeometry(profile,96),glassMat);body.geometry.computeVertexNormals();g.add(body);const rim=new THREE.Mesh(new THREE.TorusGeometry(.7,.03,16,80),glassMat);rim.rotation.x=Math.PI/2;rim.position.y=1.35;g.add(rim);const bottomCurve=new THREE.Mesh(new THREE.TorusGeometry(.61,.032,14,72),glassMat);bottomCurve.rotation.x=Math.PI/2;bottomCurve.position.y=.095;g.add(bottomCurve);const liquidHeight=Math.max(.08,level*1.08),liqMat=new THREE.MeshPhysicalMaterial({color,transparent:true,opacity:.74,roughness:.13,transmission:.14,clearcoat:.35});const liq=cylinder(.615,liquidHeight,liqMat,72);liq.position.y=.085+liquidHeight/2;g.add(liq);const meniscus=cylinder(.618,.018,new THREE.MeshPhysicalMaterial({color,transparent:true,opacity:.56,roughness:.08,transmission:.2}),72);meniscus.position.y=.085+liquidHeight;g.add(meniscus);const shineMat=new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.34,depthWrite:false});const shine=new THREE.Mesh(new THREE.PlaneGeometry(.065,1.03),shineMat);shine.position.set(-.36,.75,.575);shine.renderOrder=7;g.add(shine);const shineFine=new THREE.Mesh(new THREE.PlaneGeometry(.022,.72),new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.48,depthWrite:false}));shineFine.position.set(-.28,.79,.62);shineFine.renderOrder=7;g.add(shineFine);const marks=new THREE.Group(),markMat=new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.95,depthWrite:false,depthTest:false,side:THREE.DoubleSide});[[.3,.29],[.48,.16],[.66,.29],[.84,.16],[1.02,.29],[1.2,.16]].forEach(([y,w])=>{const r=Math.hypot(.4,.57)+.002,arc=w/r;const mark=new THREE.Mesh(new THREE.CylinderGeometry(r,r,.019,32,1,true,-arc/2,arc),markMat);mark.position.set(0,y,0);mark.rotation.y=Math.atan2(.4,.57);mark.renderOrder=9;marks.add(mark)});g.add(marks);Object.assign(g.userData,{container:true,liquidVolume:liq,liquidMeniscus:meniscus,liquidMaxHeight:liquidHeight});return shadowReady(g)}
  flask(level=.42,color=0x55b9d0){
    const g=new THREE.Group(),pts=[];
    const curve=(a,b,c,d,n=14)=>{for(let i=pts.length?1:0;i<=n;i++){const t=i/n,u=1-t;pts.push(new THREE.Vector2(u*u*u*a.x+3*u*u*t*b.x+3*u*t*t*c.x+t*t*t*d.x,u*u*u*a.y+3*u*u*t*b.y+3*u*t*t*c.y+t*t*t*d.y))}};
    curve({x:.025,y:0},{x:.36,y:0},{x:.64,y:.045},{x:.7,y:.2},18);
    curve({x:.7,y:.2},{x:.73,y:.46},{x:.35,y:1.12},{x:.21,y:1.31},24);
    curve({x:.21,y:1.31},{x:.17,y:1.38},{x:.17,y:1.43},{x:.17,y:1.5},10);
    curve({x:.17,y:1.5},{x:.17,y:1.66},{x:.17,y:1.84},{x:.16,y:1.94},12);
    const body=new THREE.Mesh(new THREE.LatheGeometry(pts,96),GLASS());
    body.geometry.computeVertexNormals();g.add(body);
    const rim=new THREE.Mesh(new THREE.TorusGeometry(.17,.026,16,72),GLASS());
    rim.rotation.x=Math.PI/2;rim.position.y=1.95;g.add(rim);

    const liquidH=Math.max(.08,level*.72),liquidBottom=.035,liquidTop=.075+liquidH;
    const bezier=(a,b,c,d,t)=>{const u=1-t;return u*u*u*a+3*u*u*t*b+3*u*t*t*c+t*t*t*d};
    const innerRadiusAt=y=>{
      const target=Math.max(0,y-liquidBottom);let lo=0,hi=1;
      if(target<=.2){
        for(let i=0;i<18;i++){const mid=(lo+hi)/2;bezier(0,0,.045,.2,mid)<target?lo=mid:hi=mid}
        return Math.max(.004,bezier(.025,.36,.64,.7,(lo+hi)/2)-.038)
      }
      for(let i=0;i<18;i++){const mid=(lo+hi)/2;bezier(.2,.46,1.12,1.31,mid)<target?lo=mid:hi=mid}
      return Math.max(.16,bezier(.7,.73,.35,.21,(lo+hi)/2)-.038)
    };
    const liquidPts=[new THREE.Vector2(0,liquidBottom)];
    for(let i=0;i<=36;i++){const y=liquidBottom+(liquidTop-liquidBottom)*i/36;liquidPts.push(new THREE.Vector2(innerRadiusAt(y),y))}
    const liquidTopRadius=innerRadiusAt(liquidTop);liquidPts.push(new THREE.Vector2(0,liquidTop));
    const liquidMat=new THREE.MeshPhysicalMaterial({color,transparent:true,opacity:.74,roughness:.16,transmission:.12,side:THREE.DoubleSide});
    const liquidGeometry=new THREE.LatheGeometry(liquidPts,72);liquidGeometry.computeVertexNormals();
    const liquid=new THREE.Mesh(liquidGeometry,liquidMat);g.add(liquid);
    const meniscus=cylinder(liquidTopRadius*.992,.018,liquidMat,72);meniscus.position.y=liquidTop;g.add(meniscus);

    const marks=new THREE.Group(),markMat=new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.92,depthWrite:false,depthTest:false,side:THREE.DoubleSide});
    [[.36,.3,.65],[.52,.18,.6],[.68,.3,.53],[.84,.18,.45],[1,.3,.36]].forEach(([y,w,z])=>{const r=Math.hypot(.25,z)+.002,arc=w/r;const tick=new THREE.Mesh(new THREE.CylinderGeometry(r,r,.018,32,1,true,-arc/2,arc),markMat);tick.position.set(0,y,0);tick.rotation.y=Math.atan2(.25,z);tick.renderOrder=8;marks.add(tick)});
    g.add(marks);Object.assign(g.userData,{container:true,liquid,meniscus,liquidTop,liquidTopRadius});return shadowReady(g)
  }
  testTube(level=.35,color=0x5dbddd,cloudy=false){const g=new THREE.Group();const tube=new THREE.Mesh(new THREE.CylinderGeometry(.18,.18,1.65,32,1,true),GLASS());tube.position.y=.86;g.add(tube);const bottom=new THREE.Mesh(new THREE.SphereGeometry(.18,32,16,0,Math.PI*2,Math.PI/2,Math.PI/2),GLASS());bottom.position.y=.035;g.add(bottom);const liq=cylinder(.155,Math.max(.08,level*.8),new THREE.MeshPhysicalMaterial({color:cloudy?0xe8e8d8:color,transparent:true,opacity:cloudy?.9:.7,roughness:cloudy?.55:.16}));liq.position.y=.11+level*.4;g.add(liq);g.userData.container=true;return shadowReady(g)}
  gasTap(open=false){const g=new THREE.Group(),enamel=new THREE.MeshPhysicalMaterial({color:0xf7f5ea,roughness:.2,metalness:.03,clearcoat:.9,clearcoatRoughness:.08}),yellow=new THREE.MeshStandardMaterial({color:0xf2c400,roughness:.3,metalness:.12}),brass=metal(0xb49345,.25);const mountingPlate=new THREE.Mesh(new THREE.CylinderGeometry(.31,.34,.11,64),enamel);mountingPlate.position.y=.055;g.add(mountingPlate);const body=new THREE.Mesh(new THREE.CylinderGeometry(.17,.2,.55,56),enamel);body.position.y=.36;g.add(body);const shoulder=new THREE.Mesh(new THREE.SphereGeometry(.19,48,24),enamel);shoulder.scale.y=.62;shoulder.position.y=.64;g.add(shoulder);const collar=cylinder(.225,.085,enamel,56);collar.position.y=.71;g.add(collar);const outlet=this.tubeBetween(new THREE.Vector3(-.39,.38,0),new THREE.Vector3(-.13,.38,0),.072,brass);g.add(outlet);for(const x of [-.4,-.34,-.28]){const ring=new THREE.Mesh(new THREE.TorusGeometry(.079,.012,8,28),brass);ring.rotation.y=Math.PI/2;ring.position.set(x,.38,0);g.add(ring)}const stem=cylinder(.055,.17,brass,28);stem.position.y=.83;g.add(stem);const valve=new THREE.Group();valve.position.y=.93;valve.rotation.y=open?Math.PI/2:0;const hub=cylinder(.12,.09,yellow,40);valve.add(hub);for(const side of [-1,1]){const wing=new THREE.Mesh(new THREE.BoxGeometry(.25,.075,.15),yellow);wing.position.set(side*.19,.01,0);valve.add(wing);const end=new THREE.Mesh(new THREE.SphereGeometry(.085,24,14),yellow);end.scale.set(.9,.58,.78);end.position.set(side*.32,.01,0);valve.add(end)}g.add(valve);const band=new THREE.Mesh(new THREE.TorusGeometry(.178,.018,10,40),yellow);band.rotation.x=Math.PI/2;band.position.y=.59;g.add(band);g.position.set(1.82,0,.24);g.userData.gasTap=true;return shadowReady(g)}
  bunsen(lit=false,flameHeight=1,wrapMode=false){
    const g=new THREE.Group();
    const baseMat=new THREE.MeshPhysicalMaterial({color:0x0c4177,roughness:.25,metalness:.3,clearcoat:.7,clearcoatRoughness:.12});
    const base=cylinder(.54,.16,baseMat);base.scale.z=.65;base.position.y=.08;g.add(base);
    const shinySteel=new THREE.MeshPhysicalMaterial({color:0xd8e2e6,metalness:.92,roughness:.06,clearcoat:.85,clearcoatRoughness:.04});
    const barrel=cylinder(.118,1.18,shinySteel);barrel.position.y=.72;g.add(barrel);
    const collar=new THREE.Mesh(new THREE.CylinderGeometry(.165,.185,.28,64),shinySteel);collar.position.y=.31;g.add(collar);
    const ringMat=metal(0xe6eeef,.05);for(const y of [.175,.445]){const ring=new THREE.Mesh(new THREE.TorusGeometry(.172,.014,12,64),ringMat);ring.rotation.x=Math.PI/2;ring.position.y=y;g.add(ring)}
    const intakeMat=new THREE.MeshBasicMaterial({color:0x071a22,roughness:.8}),frontIntake=new THREE.Mesh(new THREE.CircleGeometry(.055,40),intakeMat);frontIntake.position.set(-.04,.315,.181);g.add(frontIntake);const sideIntake=new THREE.Mesh(new THREE.CircleGeometry(.048,36),intakeMat);sideIntake.position.set(-.178,.315,-.015);sideIntake.rotation.y=-Math.PI/2;g.add(sideIntake);
    const adjustStem=this.tubeBetween(new THREE.Vector3(-.18,.315,-.05),new THREE.Vector3(-.28,.315,-.05),.025,ringMat),adjustKnob=new THREE.Mesh(new THREE.SphereGeometry(.045,28,16),shinySteel);adjustKnob.position.set(-.31,.315,-.05);adjustKnob.scale.x=.72;g.add(adjustStem,adjustKnob);
    const connector=this.tubeBetween(new THREE.Vector3(.08,.18,.04),new THREE.Vector3(.52,.18,.04),.06,metal(0xd4af37,.18));g.add(connector);
    const hoseCurve=new THREE.CatmullRomCurve3([new THREE.Vector3(.5,.18,.04),new THREE.Vector3(.78,.08,.42),new THREE.Vector3(1.08,.075,.67),new THREE.Vector3(1.3,.17,.5),new THREE.Vector3(1.43,.38,.24)],false,'centripetal');const hose=new THREE.Mesh(new THREE.TubeGeometry(hoseCurve,64,.057,14,false),new THREE.MeshStandardMaterial({color:0x17272c,roughness:.88,metalness:.02}));hose.castShadow=true;hose.receiveShadow=true;g.add(hose,this.gasTap(lit));
    if(lit){
      const uniforms={uTime:{value:0},uSeed:{value:Math.random()*20},uStrength:{value:1}};
      const flameMaterial=new THREE.ShaderMaterial({
        uniforms,
        transparent:true,
        depthWrite:false,
        side:THREE.DoubleSide,
        blending:THREE.NormalBlending,
        toneMapped:false,
        vertexShader:`
          uniform float uTime;
          uniform float uSeed;
          varying vec2 vUv;
          void main(){
            vUv=uv;
            vec3 p=position;
            float lift=smoothstep(.08,1.,uv.y);
            p.x+=(sin(uv.y*8.0+uTime*1.2+uSeed)*.0003+sin(uv.y*18.0-uTime*1.8+uSeed*.4)*.0001)*lift;
            p.y+=sin(uv.y*10.0-uTime*1.2+uSeed)*.001*lift;
            gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0);
          }
        `,
        fragmentShader:`
          uniform float uTime;
          uniform float uSeed;
          uniform float uStrength;
          varying vec2 vUv;
          float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
          float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);}
          float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<4;i++){v+=a*noise(p);p=p*2.03+vec2(17.2,9.1);a*=.5;}return v;}
          void main(){
            float y=clamp(vUv.y,0.,1.);
            float turbulence=fbm(vec2(y*5.2-uTime*.58+uSeed,vUv.x*3.1+uTime*.09));
            float fine=noise(vec2(y*17.0+uTime*1.25,vUv.x*9.0-uTime*.35+uSeed));
            float sway=(sin(y*6.0+uTime*0.8+uSeed)*.0003+sin(y*14.0-uTime*1.5)*.0001)*smoothstep(.12,1.,y);
            float x=vUv.x-.5-sway;
            float width=mix(.315,.008,pow(y,.76))*(.97+turbulence*.025+fine*.005);
            float q=abs(x)/max(width,.004);
            float outer=1.0-smoothstep(.72,1.08,q);
            float edge=smoothstep(.48,.88,q)*(1.0-smoothstep(.88,1.08,q));
            float upperFade=1.0-smoothstep(.91,1.0,y);
            float lowerFade=smoothstep(.005,.055,y);
            outer*=upperFade*lowerFade;

            float innerLife=1.0-smoothstep(.57,.72,y);
            float innerWidth=mix(.19,.008,pow(clamp(y/.7,0.,1.),.78));
            float iq=abs(x-sway*.18)/max(innerWidth,.004);
            float inner=(1.0-smoothstep(.72,.98,iq))*innerLife*lowerFade;
            float innerRim=smoothstep(.52,.78,iq)*(1.0-smoothstep(.78,1.04,iq))*innerLife;
            float base=exp(-pow((y-.035)*13.5,2.0))*exp(-pow(x*5.2,2.0));
            float hotCore=exp(-pow((y-.18)*5.6,2.0))*exp(-pow(x*8.2,2.0));

            vec3 deep=vec3(.015,.16,.82);
            vec3 blue=vec3(.01,.48,1.0);
            vec3 cyan=vec3(.38,.86,1.0);
            vec3 colour=mix(blue,cyan,smoothstep(.18,.92,y));
            colour=mix(colour,deep,inner*.92);
            colour=mix(colour,vec3(.18,.72,1.0),innerRim);
            colour=mix(colour,vec3(.86,.98,1.0),base*.9+hotCore*.28);
            colour+=vec3(.08,.27,.4)*edge*(.45+.55*turbulence);
            float alpha=outer*(.31+edge*.32+(1.0-inner)*.08+turbulence*.08)+inner*.24+innerRim*.22+base*.52;
            alpha*=uStrength;
            if(alpha<.012)discard;
            gl_FragColor=vec4(colour,clamp(alpha,0.,.88));
          }
        `
      });
      const sheetGeo=new THREE.PlaneGeometry(.58,1.42,32,72);sheetGeo.translate(0,.71,0);
      const sheet=new THREE.Mesh(sheetGeo,flameMaterial);sheet.position.set(0,1.29,.035);sheet.renderOrder=6;sheet.castShadow=false;sheet.receiveShadow=false;
      const veilMat=flameMaterial.clone();veilMat.uniforms={uTime:uniforms.uTime,uSeed:{value:uniforms.uSeed.value+4.7},uStrength:{value:.14}};veilMat.blending=THREE.AdditiveBlending;
      const veil=new THREE.Mesh(sheetGeo.clone(),veilMat);veil.position.set(0,1.29,-.015);veil.rotation.y=Math.PI*.46;veil.scale.set(.82,1.02,.82);veil.renderOrder=5;veil.castShadow=false;veil.receiveShadow=false;
      const rimMat=new THREE.MeshBasicMaterial({color:0x77deff,transparent:true,opacity:.64,toneMapped:false,depthWrite:false});
      const rim=new THREE.Mesh(new THREE.TorusGeometry(.118,.015,12,64),rimMat);rim.rotation.x=Math.PI/2;rim.position.y=1.31;rim.renderOrder=7;rim.castShadow=false;
      const hotBase=new THREE.Mesh(new THREE.CircleGeometry(.088,64),new THREE.MeshBasicMaterial({color:0xdcfbff,transparent:true,opacity:.72,side:THREE.DoubleSide,toneMapped:false,depthWrite:false}));hotBase.rotation.x=-Math.PI/2;hotBase.position.y=1.315;hotBase.renderOrder=8;hotBase.castShadow=false;
      const jets=[];for(let i=0;i<10;i++){const a=i/10*Math.PI*2,mat=new THREE.MeshBasicMaterial({color:0x79dfff,transparent:true,opacity:.52,depthWrite:false,toneMapped:false}),jet=new THREE.Mesh(new THREE.ConeGeometry(.016,.14,12),mat);jet.position.set(Math.cos(a)*.09,1.39,Math.sin(a)*.09);jet.renderOrder=7;jet.castShadow=false;g.add(jet);jets.push(jet)}
      let wrap=null,wrapJets=[],wrapY=1.29+1.42*flameHeight*.94;if(wrapMode){const wrapMat=new THREE.MeshBasicMaterial({color:0x73dfff,transparent:true,opacity:.3,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false});wrap=new THREE.Mesh(new THREE.TorusGeometry(.48,.052,14,64),wrapMat);wrap.rotation.x=Math.PI/2;wrap.position.y=wrapY;wrap.scale.z=.72;wrap.renderOrder=7;g.add(wrap);for(let i=0;i<8;i++){const a=i/8*Math.PI*2,jet=new THREE.Mesh(new THREE.ConeGeometry(.04,.2,12),wrapMat);jet.position.set(Math.cos(a)*.48,wrapY+.045,Math.sin(a)*.48);jet.scale.y=.72+(i%3)*.12;jet.renderOrder=7;g.add(jet);wrapJets.push(jet)}}
      const glow=new THREE.PointLight(0x249dff,3.8,4.2,1.8);glow.position.y=1.7;
      g.add(sheet,veil,rim,hotBase,glow);shadowReady(g);[sheet,veil,rim,hotBase,...jets,...wrapJets].forEach(o=>{o.castShadow=false;o.receiveShadow=false});this.flames.push({sheet,veil,uniforms,veilUniforms:veilMat.uniforms,glow,height:flameHeight,seed:uniforms.uSeed.value,wrap,wrapJets,wrapY,jets})
      return g
    }
    return shadowReady(g)
  }
  flameTestJar({label='LiCl',name='Lithium',solidColor=0xf1efea,selected=false}={}){
    const g=new THREE.Group(),glass=new THREE.MeshPhysicalMaterial({color:0xd9f6ff,transparent:true,opacity:.42,transmission:.7,roughness:.035,ior:1.46,thickness:.1,clearcoat:.9,clearcoatRoughness:.04,side:THREE.DoubleSide,depthWrite:false}),steel=metal(0xa9b6ba,.2),saltMat=new THREE.MeshPhysicalMaterial({color:solidColor,roughness:.76,metalness:.02,clearcoat:.08});
    const wall=new THREE.Mesh(new THREE.CylinderGeometry(.34,.36,.72,64,1,true),glass);wall.position.y=.38;g.add(wall);const bottom=cylinder(.36,.055,glass,64);bottom.position.y=.035;g.add(bottom);const rim=new THREE.Mesh(new THREE.TorusGeometry(.34,.035,14,64),glass);rim.rotation.x=Math.PI/2;rim.position.y=.75;g.add(rim);const saltBed=cylinder(.29,.18,saltMat,56);saltBed.position.y=.14;g.add(saltBed);
    for(let i=0;i<28;i++){const a=i*2.399,r=.035+(i%6)*.043,grain=new THREE.Mesh(new THREE.DodecahedronGeometry(.025+(i%4)*.006,0),saltMat);grain.position.set(Math.cos(a)*r,.24+(i%3)*.012,Math.sin(a)*r);grain.rotation.set(i*.71,i*.37,i*.93);grain.scale.set(1.35,.7,1);g.add(grain)}
    const labelCanvas=document.createElement('canvas'),lc=labelCanvas.getContext('2d');labelCanvas.width=512;labelCanvas.height=260;lc.fillStyle='#fffdf5';lc.fillRect(0,0,512,260);lc.fillStyle=selected?'#c44939':'#203943';lc.font='800 88px Inter, sans-serif';lc.textAlign='center';lc.textBaseline='middle';lc.fillText(label,256,92);lc.fillStyle='#66777d';lc.font='650 43px Inter, sans-serif';lc.fillText(name.toUpperCase(),256,184);const texture=new THREE.CanvasTexture(labelCanvas);texture.colorSpace=THREE.SRGBColorSpace;const arc=0.55/0.351;const labelGeo=new THREE.CylinderGeometry(0.347,0.355,0.28,48,1,true,-arc/2,arc);const labelMat=new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide,toneMapped:false});const labelMesh=new THREE.Mesh(labelGeo,labelMat);labelMesh.position.set(0,.43,0);labelMesh.renderOrder=9;g.add(labelMesh);
    if(selected){const ring=new THREE.Mesh(new THREE.TorusGeometry(.48,.035,12,64),new THREE.MeshBasicMaterial({color:0x20d4b0,transparent:true,opacity:.84,depthWrite:false,toneMapped:false}));ring.rotation.x=Math.PI/2;ring.position.y=.035;ring.renderOrder=10;g.add(ring)}return shadowReady(g)
  }
  flameTestRig(state){
    const g=new THREE.Group(),salts=[
      {label:'LiCl',name:'Lithium',solidColor:0xf3f0ed,flameColor:0xe83e55},
      {label:'NaCl',name:'Sodium',solidColor:0xf4f2ec,flameColor:0xffd21f},
      {label:'KCl',name:'Potassium',solidColor:0xeee9f2,flameColor:0xbd82ff},
      {label:'CaCl₂',name:'Calcium',solidColor:0xeee9df,flameColor:0xff6338},
      {label:'CuCl₂',name:'Copper',solidColor:0x4aa990,flameColor:0x2de0bd}
    ],jarXs=[-2.7,-1.35,0,1.35,2.7],jarZ=-.98,selected=Math.max(0,Math.min(salts.length-1,state.flameTestSalt||0)),salt=salts[selected];
    salts.forEach((item,i)=>{const jar=this.flameTestJar({...item,selected:i===selected});jar.position.set(jarXs[i],0,jarZ);jar.scale.setScalar(.94);g.add(jar)});
    const burner=this.bunsen(true,.9);burner.position.set(0,0,.58);g.add(burner);
    const steel=metal(0xcbd5d8,.1),darkSteel=metal(0x65777d,.2),spatula=new THREE.Group(),handle=this.tubeBetween(new THREE.Vector3(.12,0,0),new THREE.Vector3(2.12,0,0),.047,steel);spatula.add(handle);const grip=this.tubeBetween(new THREE.Vector3(1.48,0,0),new THREE.Vector3(2.16,0,0),.075,darkSteel);spatula.add(grip);const endCap=new THREE.Mesh(new THREE.SphereGeometry(.078,28,16),darkSteel);endCap.position.x=2.17;spatula.add(endCap);const scoop=new THREE.Mesh(new THREE.SphereGeometry(.27,48,24,0,Math.PI*2,0,Math.PI/2),new THREE.MeshPhysicalMaterial({color:0xd7e1e3,metalness:.9,roughness:.1,clearcoat:.65,side:THREE.DoubleSide}));scoop.scale.set(1.05,.24,.72);scoop.position.set(-.12,-.025,0);scoop.rotation.z=Math.PI;spatula.add(scoop);
    const saltLoad=new THREE.Group(),grainMat=new THREE.MeshStandardMaterial({color:salt.solidColor,roughness:.74,metalness:.02});for(let i=0;i<18;i++){const a=i*2.399,r=.018+(i%5)*.026,grain=new THREE.Mesh(new THREE.DodecahedronGeometry(.018+(i%3)*.005,0),grainMat);grain.position.set(-.13+Math.cos(a)*r,.035+(i%3)*.006,Math.sin(a)*r*.72);grain.rotation.set(i*.8,i*.4,i*.63);saltLoad.add(grain)}saltLoad.visible=false;spatula.add(saltLoad);g.add(spatula);
    const additive=(opacity=0)=>new THREE.MeshBasicMaterial({color:salt.flameColor,transparent:true,opacity,blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false,side:THREE.DoubleSide}),outerMat=additive(),coreMat=additive(),haloMat=additive(),outerGeo=new THREE.ConeGeometry(.44,1.45,64,1,true);outerGeo.translate(0,1.45/2,0);const coreGeo=new THREE.ConeGeometry(.25,1.20,56,1,true);coreGeo.translate(0,1.20/2,0);const haloGeo=new THREE.ConeGeometry(.56,1.60,48,1,true);haloGeo.translate(0,1.60/2,0);const outer=new THREE.Mesh(outerGeo,outerMat),core=new THREE.Mesh(coreGeo,coreMat),halo=new THREE.Mesh(haloGeo,haloMat);[outer,core,halo].forEach(mesh=>{mesh.visible=false;mesh.renderOrder=12;mesh.castShadow=false;g.add(mesh)});const colourLight=new THREE.PointLight(salt.flameColor,0,4.8,1.7);g.add(colourLight);
    this.dynamic.push({kind:'flameTest',spatula,saltLoad,jarPoint:new THREE.Vector3(jarXs[selected],1.02,jarZ),restPoint:new THREE.Vector3(1.2,.24,2.35),flamePoint:new THREE.Vector3(.12,1.82,.58),outer,core,halo,outerMat,coreMat,haloMat,colourLight,seed:selected*1.7+.4});
    g.userData.flameTestRig=true;return shadowReady(g)
  }
  electricHeatingMantle(active=false){
    const g=new THREE.Group(),shell=solid(0x273a43,.32),trim=metal(0xaebbc0,.18),dark=solid(0x111c21,.82),coilMat=new THREE.MeshStandardMaterial({color:active?0xff7538:0x482c26,roughness:.38,metalness:.32,emissive:active?0xff3b10:0x000000,emissiveIntensity:active?2.4:0}),panelMat=solid(0x15242b,.35);
    const foot=cylinder(.91,.14,shell,72);foot.position.y=.07;g.add(foot);
    const body=new THREE.Mesh(new THREE.CylinderGeometry(.73,.88,.66,72,1,true),shell);body.position.y=.42;g.add(body);
    const cup=new THREE.Mesh(new THREE.SphereGeometry(.72,64,28,0,Math.PI*2,Math.PI/2,Math.PI/2),dark);cup.position.y=.73;cup.scale.y=.73;g.add(cup);
    const rim=new THREE.Mesh(new THREE.TorusGeometry(.73,.045,16,72),trim);rim.rotation.x=Math.PI/2;rim.position.y=.73;g.add(rim);
    const coil=new THREE.Mesh(new THREE.TorusGeometry(.53,.045,12,96),coilMat);coil.rotation.x=Math.PI/2;coil.position.y=.63;coil.scale.z=.78;g.add(coil);
    const panel=new THREE.Mesh(new THREE.BoxGeometry(.82,.32,.12),panelMat);panel.position.set(0,.32,.74);g.add(panel);
    const indicatorMat=new THREE.MeshBasicMaterial({color:active?0xff7045:0x5b2721,toneMapped:false});const indicator=new THREE.Mesh(new THREE.SphereGeometry(.055,24,14),indicatorMat);indicator.scale.z=.36;indicator.position.set(-.24,.35,.815);g.add(indicator);
    const dial=cylinder(.12,.075,trim,36);dial.rotation.x=Math.PI/2;dial.position.set(.2,.32,.825);g.add(dial);const pointer=new THREE.Mesh(new THREE.BoxGeometry(.018,.1,.012),solid(active?0xffefe7:0x4f6269,.4));pointer.position.set(.2,.36,.87);pointer.rotation.z=active?-.75:-2.3;g.add(pointer);
    for(const x of [-.63,.63]){const rubber=cylinder(.1,.055,dark,32);rubber.position.set(x,.025,.25);g.add(rubber)}
    const cordCurve=new THREE.CatmullRomCurve3([new THREE.Vector3(-.62,.16,-.34),new THREE.Vector3(-1.02,.08,-.54),new THREE.Vector3(-1.32,.07,-.26),new THREE.Vector3(-1.48,.05,.16)],false,'centripetal');const cord=new THREE.Mesh(new THREE.TubeGeometry(cordCurve,48,.038,10,false),solid(0x11191c,.92));g.add(cord);
    const heatLight=new THREE.PointLight(0xff5d2a,active?3.8:0,2.5,1.8);heatLight.position.set(0,.78,.18);g.add(heatLight);this.dynamic.push({kind:'electricHeater',coil,indicator,light:heatLight,active,seed:1.9});
    g.userData.electricHeatingMantle=true;return shadowReady(g)
  }
  roundBottomFlask(level=.55,boiling=false){
    const g=new THREE.Group(),glass=GLASS(),liquidMat=new THREE.MeshPhysicalMaterial({color:0x55b7d4,transparent:true,opacity:.7,roughness:.12,transmission:.18,clearcoat:.25,depthWrite:false});
    const globe=new THREE.Mesh(new THREE.SphereGeometry(.65,72,40),glass);globe.scale.y=.94;globe.position.y=1.08;g.add(globe);
    const shoulder=new THREE.Mesh(new THREE.TorusGeometry(.31,.025,14,64),glass);shoulder.rotation.x=Math.PI/2;shoulder.position.y=1.58;g.add(shoulder);
    const neck=new THREE.Mesh(new THREE.CylinderGeometry(.19,.19,.68,56,1,true),glass);neck.position.y=1.84;g.add(neck);
    const rim=new THREE.Mesh(new THREE.TorusGeometry(.19,.028,14,64),glass);rim.rotation.x=Math.PI/2;rim.position.y=2.18;g.add(rim);
    const liquid=new THREE.Mesh(new THREE.SphereGeometry(.565,64,30,0,Math.PI*2,Math.PI/2,Math.PI/2),liquidMat);liquid.scale.y=.8+level*.18;liquid.position.y=1.07;g.add(liquid);
    const surface=cylinder(.555,.018,new THREE.MeshPhysicalMaterial({color:0x9edced,transparent:true,opacity:.7,roughness:.07,transmission:.15,depthWrite:false}),64);surface.position.y=1.07;g.add(surface);
    const shine=new THREE.Mesh(new THREE.PlaneGeometry(.085,.72),new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.42,depthWrite:false}));shine.position.set(-.31,1.2,.51);shine.rotation.z=-.18;shine.renderOrder=9;g.add(shine);
    if(boiling){const bubbles=this.bubbleCloud(26,.46,.5,0xf0fcff);bubbles.position.y=.49;bubbles.userData.boilingCloud=true;g.add(bubbles)}
    g.userData.roundBottomFlask=true;return shadowReady(g)
  }
  retortStand(){
    const g=new THREE.Group(),baseMat=solid(0x26373e,.34),rodMat=metal(0x9aa8ad,.18);const base=new THREE.Mesh(new THREE.BoxGeometry(1.18,.13,.72),baseMat);base.position.set(0,.065,-.28);g.add(base);const rod=cylinder(.045,2.72,rodMat,28);rod.position.set(0,1.38,-.4);g.add(rod);const boss=new THREE.Mesh(new THREE.BoxGeometry(.27,.22,.25),baseMat);boss.position.set(0,2.13,-.34);g.add(boss);const clamp=this.tubeBetween(new THREE.Vector3(0,2.13,-.3),new THREE.Vector3(0,2.13,.08),.035,rodMat);g.add(clamp);for(const x of [-.17,.17]){const jaw=new THREE.Mesh(new THREE.TorusGeometry(.13,.025,10,28,Math.PI*.7),rodMat);jaw.position.set(x,2.13,.08);jaw.rotation.set(Math.PI/2,0,x<0?-.4:Math.PI+.4);g.add(jaw)}return shadowReady(g)
  }
  waterDistillationRig(state){
    const g=new THREE.Group(),heaterOn=!!state.burner,coolingOn=!!state.coolingWater,distilling=heaterOn&&coolingOn&&!state.complete,progress=Math.max(0,Math.min(1,state.progress||0)),glass=GLASS(),coolantMat=new THREE.MeshPhysicalMaterial({color:0x25b8df,transparent:true,opacity:.07+this.coolantVisualLevel*.17,roughness:.08,transmission:.42,depthWrite:false}),hoseMat=new THREE.MeshPhysicalMaterial({color:0x397b91,transparent:true,opacity:.52,roughness:.28,transmission:.16,depthWrite:false}),xBoiler=-2.05;
    const heater=this.electricHeatingMantle(heaterOn);heater.position.x=xBoiler;g.add(heater);const flask=this.roundBottomFlask(.57,distilling);flask.position.x=xBoiler;g.add(flask);const boilingCloud=flask.children.find(child=>child.userData.boilingCloud);if(boilingCloud)this.dynamic.push({kind:'waterBoiling',group:boilingCloud,onset:.12});
    const columnShell=new THREE.Mesh(new THREE.CylinderGeometry(.205,.205,.72,56,1,true),glass);columnShell.position.set(xBoiler,2.51,.02);g.add(columnShell);for(const y of [2.18,2.31,2.44,2.57,2.7]){const ring=new THREE.Mesh(new THREE.TorusGeometry(.202,.018,10,48),glass);ring.rotation.x=Math.PI/2;ring.position.set(xBoiler,y,.02);g.add(ring)}for(let i=0;i<5;i++){const y=2.24+i*.115,left=i%2===0,a=new THREE.Vector3(xBoiler+(left?-.18:.18),y,.02),b=new THREE.Vector3(xBoiler+(left?.035:-.035),y-.045,.02);g.add(this.tubeBetween(a,b,.025,glass))}
    const stopper=cylinder(.225,.12,solid(0x26343a,.78),48);stopper.position.set(xBoiler,2.92,.02);g.add(stopper);const thermometerGlass=new THREE.Mesh(new THREE.CylinderGeometry(.045,.045,.92,32,1,true),glass);thermometerGlass.position.set(xBoiler,3.26,.02);g.add(thermometerGlass);const thermometerBaseY=2.82,thermometerMinHeight=.12,thermometerMaxHeight=.78,thermometerColumn=cylinder(.014,1,new THREE.MeshBasicMaterial({color:0xd94038,toneMapped:false}),18);thermometerColumn.scale.y=thermometerMinHeight;thermometerColumn.position.set(xBoiler,thermometerBaseY+thermometerMinHeight/2,.025);g.add(thermometerColumn);this.dynamic.push({kind:'distillationThermometer',column:thermometerColumn,baseY:thermometerBaseY,minHeight:thermometerMinHeight,maxHeight:thermometerMaxHeight});const bulb=new THREE.Mesh(new THREE.SphereGeometry(.058,24,16),new THREE.MeshStandardMaterial({color:0xd94038,roughness:.25}));bulb.scale.y=1.35;bulb.position.set(xBoiler,2.82,.025);g.add(bulb);const thermometerMarkMat=new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.96,depthWrite:false,depthTest:false,side:THREE.DoubleSide,toneMapped:false}),thermometerMarkRadius=.0485;for(let i=1;i<10;i++){const major=i%3===0,arcLength=major?.096:.064,arc=arcLength/thermometerMarkRadius,mark=new THREE.Mesh(new THREE.CylinderGeometry(thermometerMarkRadius,thermometerMarkRadius,major?.012:.009,32,1,true,-arc/2,arc),thermometerMarkMat);mark.position.set(xBoiler,2.94+i*.075,.02);mark.renderOrder=15;g.add(mark)}
    const headStart=new THREE.Vector3(xBoiler+.14,2.67,.02),headEnd=new THREE.Vector3(-1.5,2.52,.02);g.add(this.tubeBetween(headStart,headEnd,.105,glass));
    const condenserA=new THREE.Vector3(-1.5,2.52,.02),condenserB=new THREE.Vector3(.92,1.72,.02),axis=condenserB.clone().sub(condenserA).normalize();const outer=this.tubeBetween(condenserA,condenserB,.245,glass);outer.renderOrder=5;g.add(outer);const coolant=this.tubeBetween(condenserA.clone().addScaledVector(axis,.12),condenserB.clone().addScaledVector(axis,-.12),.19,coolantMat);coolant.renderOrder=3;g.add(coolant);const vapourTube=this.tubeBetween(condenserA.clone().addScaledVector(axis,-.16),condenserB.clone().addScaledVector(axis,.16),.072,glass);vapourTube.renderOrder=7;g.add(vapourTube);
    const ringAt=(point,radius)=>{const ring=new THREE.Mesh(new THREE.TorusGeometry(radius,.027,12,56),glass);ring.position.copy(point);ring.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),axis);ring.renderOrder=8;g.add(ring)};ringAt(condenserA,.255);ringAt(condenserB,.255);ringAt(condenserA.clone().addScaledVector(axis,.22),.255);ringAt(condenserB.clone().addScaledVector(axis,-.22),.255);
    const lowAttach=condenserA.clone().lerp(condenserB,.83),highAttach=condenserA.clone().lerp(condenserB,.18),lowPortEnd=lowAttach.clone().add(new THREE.Vector3(.06,-.27,.34)),highPortEnd=highAttach.clone().add(new THREE.Vector3(-.06,.27,.34));g.add(this.tubeBetween(lowAttach,lowPortEnd,.07,glass),this.tubeBetween(highAttach,highPortEnd,.07,glass));
    const inletPoints=[new THREE.Vector3(3.02,.12,.82),new THREE.Vector3(2.56,.12,.86),new THREE.Vector3(2.3,.62,.78),new THREE.Vector3(2.18,1.18,.67),new THREE.Vector3(1.68,1.35,.52),lowPortEnd],outletPoints=[highPortEnd,new THREE.Vector3(-.72,1.42,.68),new THREE.Vector3(-.72,.34,.88),new THREE.Vector3(-3.02,.12,.86)],inletCurve=new THREE.CatmullRomCurve3(inletPoints,false,'centripetal'),outletCurve=new THREE.CatmullRomCurve3(outletPoints,false,'centripetal'),jacketCurve=new THREE.CatmullRomCurve3([condenserB.clone().add(new THREE.Vector3(0,0,.12)),condenserA.clone().add(condenserB).multiplyScalar(.5).add(new THREE.Vector3(0,0,.12)),condenserA.clone().add(new THREE.Vector3(0,0,.12))],false,'centripetal');g.add(new THREE.Mesh(new THREE.TubeGeometry(inletCurve,72,.062,14,false),hoseMat),new THREE.Mesh(new THREE.TubeGeometry(outletCurve,64,.062,14,false),hoseMat));
    const addFlowTranslucency=(curve,segments,radius,color,source,speed,cycles,phase=0)=>{const uniforms={uTime:{value:0},uActive:{value:source==='coolant'?this.coolantVisualLevel:0},uColor:{value:new THREE.Color(color)},uSpeed:{value:speed},uCycles:{value:cycles},uPhase:{value:phase},uBase:{value:source==='coolant'?.025:.018},uPulse:{value:source==='coolant'?.15:.105}},material=new THREE.ShaderMaterial({uniforms,transparent:true,depthWrite:false,depthTest:true,side:THREE.DoubleSide,toneMapped:false,vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,fragmentShader:`uniform float uTime;uniform float uActive;uniform float uSpeed;uniform float uCycles;uniform float uPhase;uniform float uBase;uniform float uPulse;uniform vec3 uColor;varying vec2 vUv;void main(){float travelling=vUv.x-uTime*uSpeed+uPhase;float primary=.5+.5*sin(travelling*6.2831853*uCycles);float secondary=.5+.5*sin((travelling*.53+.17)*6.2831853*uCycles);float change=.72*primary+.28*secondary;float endFade=smoothstep(0.0,.045,vUv.x)*(1.0-smoothstep(.955,1.0,vUv.x));float alpha=uActive*endFade*(uBase+uPulse*change);if(alpha<.002)discard;gl_FragColor=vec4(uColor,alpha);}`}),mesh=new THREE.Mesh(new THREE.TubeGeometry(curve,segments,radius,16,false),material);mesh.renderOrder=11;mesh.castShadow=false;mesh.receiveShadow=false;g.add(mesh);this.dynamic.push({kind:'translucencyFlow',uniforms,source,onset:.16});return mesh};
    addFlowTranslucency(inletCurve,96,.066,0x8ee9ff,'coolant',.18,1.35,0);addFlowTranslucency(jacketCurve,84,.193,0x79ddf5,'coolant',.21,1.15,.28);addFlowTranslucency(outletCurve,88,.066,0x8ee9ff,'coolant',.17,1.3,.57);this.dynamic.push({kind:'coolantSleeve',mesh:coolant});
    const stand=this.retortStand();stand.position.set(-.12,0,-.03);g.add(stand);
    const receiver=this.beaker(.675,0x8ed7e9);receiver.position.set(1.55,0,.04);receiver.scale.setScalar(.72);g.add(receiver);const receiverFill={kind:'receiverFill',liquid:receiver.userData.liquidVolume,meniscus:receiver.userData.liquidMeniscus,maxHeight:receiver.userData.liquidMaxHeight,groupScale:.72,surfaceY:.12};this.dynamic.push(receiverFill);const adapterPoints=[condenserB.clone(),new THREE.Vector3(1.18,1.6,.02),new THREE.Vector3(1.45,1.32,.02),new THREE.Vector3(1.55,1.04,.02)],adapterCurve=new THREE.CatmullRomCurve3(adapterPoints,false,'centripetal');g.add(new THREE.Mesh(new THREE.TubeGeometry(adapterCurve,48,.072,16,false),glass));
    const dripMat=new THREE.MeshPhysicalMaterial({color:0xe4f9ff,transparent:true,opacity:0,roughness:.04,transmission:.42,clearcoat:.7,depthWrite:false}),receiverDrop=new THREE.Mesh(new THREE.SphereGeometry(.036,24,16),dripMat);receiverDrop.scale.set(.82,1.42,.82);receiverDrop.renderOrder=14;receiverDrop.visible=false;g.add(receiverDrop);const rippleMat=new THREE.MeshBasicMaterial({color:0xd8f8ff,transparent:true,opacity:0,depthWrite:false,toneMapped:false}),splashRing=new THREE.Mesh(new THREE.TorusGeometry(.06,.008,10,40),rippleMat);splashRing.rotation.x=Math.PI/2;splashRing.renderOrder=14;splashRing.visible=false;g.add(splashRing);const splashMat=new THREE.MeshBasicMaterial({color:0xe9fbff,transparent:true,opacity:0,depthWrite:false,toneMapped:false}),splashDrops=[];for(let i=0;i<6;i++){const splash=new THREE.Mesh(new THREE.SphereGeometry(.011+(i%3)*.003,14,10),splashMat);splash.renderOrder=15;splash.visible=false;g.add(splash);splashDrops.push(splash)}this.dynamic.push({kind:'receiverDrip',drop:receiverDrop,ring:splashRing,splashDrops,fill:receiverFill,start:new THREE.Vector3(1.55,1.015,.025),speed:1.12,phase:.08});
    const productCurve=new THREE.CatmullRomCurve3([new THREE.Vector3(xBoiler,1.15,.02),new THREE.Vector3(xBoiler,2.52,.02),headEnd,condenserA.clone().lerp(condenserB,.5),condenserB,...adapterPoints.slice(1)],false,'centripetal');addFlowTranslucency(productCurve,132,.036,0xe0f9ff,'distillate',.105,1.2,.12);
    g.userData.waterDistillationRig=true;return shadowReady(g)
  }
  titrationRig(state){
    const g=new THREE.Group(),glass=GLASS(),steel=metal(0xaebbc1,.14),dark=solid(0x26363d,.34),rubber=solid(0x20282b,.86),whiteTile=new THREE.MeshPhysicalMaterial({color:0xfaf9f1,roughness:.24,metalness:0,clearcoat:.82,clearcoatRoughness:.12}),buretteX=.06,tubeBottom=2.28,tubeTop=3.9,tubeLength=tubeTop-tubeBottom,stopcockY=2.07,standBaseX=-1.62,standZ=.08,reading=Math.max(0,Math.min(50,state.titrationVolume||0));
    const liquidBottomY=tubeBottom+.03,liquidMaxHeight=tubeLength-.07,scaleTop=liquidBottomY+liquidMaxHeight,scaleLength=liquidMaxHeight;
    const tile=new THREE.Mesh(new THREE.BoxGeometry(2.35,.065,2.05),whiteTile);tile.position.set(.12,.14,.08);tile.receiveShadow=true;g.add(tile);const tileEdge=new THREE.LineSegments(new THREE.EdgesGeometry(tile.geometry),new THREE.LineBasicMaterial({color:0xc6c9c5,transparent:true,opacity:.72}));tileEdge.position.copy(tile.position);g.add(tileEdge);

    const base=new THREE.Mesh(new THREE.BoxGeometry(1.55,.16,.94),dark);base.position.set(standBaseX,.09,standZ);base.rotation.y=-Math.PI/2;g.add(base);const baseTop=new THREE.Mesh(new THREE.BoxGeometry(1.42,.025,.82),metal(0x53636a,.3));baseTop.position.set(standBaseX,.18,standZ);baseTop.rotation.y=-Math.PI/2;g.add(baseTop);for(const x of [standBaseX-.3,standBaseX+.3])for(const z of [standZ-.62,standZ+.62]){const foot=cylinder(.09,.045,rubber,28);foot.position.set(x,.025,z);g.add(foot)}
    const rod=cylinder(.055,3.78,steel,36);rod.position.set(-1.28,2.02,standZ-.14);g.add(rod);const rodCap=new THREE.Mesh(new THREE.SphereGeometry(.07,24,14),steel);rodCap.position.set(-1.28,3.94,standZ-.14);g.add(rodCap);

    const bossBody=new THREE.Mesh(new THREE.BoxGeometry(.38,.31,.34),dark);bossBody.position.set(-1.28,3.1,-.04);g.add(bossBody);const bossCollar=cylinder(.105,.48,steel,32);bossCollar.rotation.z=Math.PI/2;bossCollar.position.set(-1.02,3.1,-.04);g.add(bossCollar);const bossScrew=this.tubeBetween(new THREE.Vector3(-1.28,3.11,.13),new THREE.Vector3(-1.28,3.11,.38),.045,steel);g.add(bossScrew);const bossKnob=cylinder(.115,.075,dark,32);bossKnob.rotation.x=Math.PI/2;bossKnob.position.set(-1.28,3.11,.425);g.add(bossKnob);
    const clampArm=this.tubeBetween(new THREE.Vector3(-1.02,3.1,-.04),new THREE.Vector3(-.25,3.1,0),.046,steel);g.add(clampArm);const clampHinge=new THREE.Mesh(new THREE.BoxGeometry(.3,.24,.3),dark);clampHinge.position.set(-.22,3.1,0);g.add(clampHinge);const clampScrew=this.tubeBetween(new THREE.Vector3(-.22,3.1,.14),new THREE.Vector3(-.22,3.1,.42),.035,steel);g.add(clampScrew);const clampWheel=cylinder(.1,.055,dark,28);clampWheel.rotation.x=Math.PI/2;clampWheel.position.set(-.22,3.1,.465);g.add(clampWheel);
    const clampY=3.1,leftJaw=new THREE.Mesh(new THREE.BoxGeometry(.315,.09,.115),steel);leftJaw.position.set(-.2425,clampY,-.02);g.add(leftJaw);const rightJaw=new THREE.Mesh(new THREE.BoxGeometry(.063,.09,.115),steel);rightJaw.position.set(.1965,clampY,-.02);g.add(rightJaw);const leftPad=new THREE.Mesh(new THREE.BoxGeometry(.04,.145,.145),rubber);leftPad.position.set(buretteX-.125,clampY,.02);g.add(leftPad);const rightPad=new THREE.Mesh(new THREE.BoxGeometry(.04,.145,.145),rubber);rightPad.position.set(buretteX+.125,clampY,.02);g.add(rightPad);

    const buretteTube=new THREE.Mesh(new THREE.CylinderGeometry(.105,.105,tubeLength,48,1,true),glass);buretteTube.position.set(buretteX,(tubeTop+tubeBottom)/2,.02);buretteTube.renderOrder=8;g.add(buretteTube);const topRim=new THREE.Mesh(new THREE.TorusGeometry(.106,.018,12,48),glass);topRim.rotation.x=Math.PI/2;topRim.position.set(buretteX,tubeTop,.02);g.add(topRim);
    const naohMat=new THREE.MeshPhysicalMaterial({color:0xcdf3f5,transparent:true,opacity:.72,roughness:.08,transmission:.2,depthWrite:false}),liquid=cylinder(.078,1,naohMat,40);liquid.position.set(buretteX,liquidBottomY,.02);liquid.renderOrder=5;g.add(liquid);const meniscus=cylinder(.079,.014,new THREE.MeshPhysicalMaterial({color:0xe7ffff,transparent:true,opacity:.82,roughness:.04,depthWrite:false}),40);meniscus.position.set(buretteX,scaleTop,.02);meniscus.renderOrder=9;g.add(meniscus);
    const markMat=new THREE.MeshBasicMaterial({color:0x26353b,transparent:true,opacity:.92,depthWrite:false,depthTest:false,side:THREE.DoubleSide,toneMapped:false}),makeLabel=value=>{const c=document.createElement('canvas'),cx=c.getContext('2d');c.width=128;c.height=64;cx.clearRect(0,0,128,64);cx.fillStyle='#22343b';cx.font='700 31px ui-monospace, Menlo, monospace';cx.textAlign='center';cx.textBaseline='middle';cx.fillText(String(value),64,32);const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;const plane=new THREE.Mesh(new THREE.PlaneGeometry(.17,.078),new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false,depthTest:false,toneMapped:false}));plane.renderOrder=15;return plane},markRadius=.112,markEndAngle=Math.asin(.105/markRadius);
    for(let i=0;i<=50;i++){const y=scaleTop-i/50*scaleLength,major=i%10===0,mid=i%5===0,length=major?.158:mid?.118:.074,startX=.105-length,startAngle=Math.asin(Math.max(-.98,Math.min(.98,startX/markRadius))),mark=new THREE.Mesh(new THREE.CylinderGeometry(markRadius,markRadius,.008,32,1,true,startAngle,markEndAngle-startAngle),markMat);mark.position.set(buretteX,y,.02);mark.renderOrder=14;g.add(mark);if(major){const label=makeLabel(i);label.position.set(buretteX+.268,y,.132);g.add(label)}}
    const scaleLine=new THREE.Mesh(new THREE.CylinderGeometry(markRadius,markRadius,scaleLength,48,1,true,markEndAngle-.021,.042),markMat);scaleLine.position.set(buretteX,scaleTop-scaleLength/2,.02);scaleLine.renderOrder=13;g.add(scaleLine);

    const stopcockConnector=cylinder(.058,.13,glass,36);stopcockConnector.position.set(buretteX,2.235,.02);g.add(stopcockConnector);const stopcockBarrel=new THREE.Mesh(new THREE.CylinderGeometry(.14,.14,.25,40),glass);stopcockBarrel.rotation.z=Math.PI/2;stopcockBarrel.position.set(buretteX,stopcockY,.02);g.add(stopcockBarrel);const stopcockPlug=cylinder(.07,.34,new THREE.MeshPhysicalMaterial({color:0xf4f2e7,roughness:.2,clearcoat:.72}),32);stopcockPlug.rotation.x=Math.PI/2;stopcockPlug.position.set(buretteX,stopcockY,.02);g.add(stopcockPlug);const handle=new THREE.Group();handle.position.set(buretteX,stopcockY,.23);handle.rotation.z=state.titrationStage===2&&state.running?0:Math.PI/2;const handleStem=new THREE.Mesh(new THREE.BoxGeometry(.08,.36,.065),solid(0xe9edf0,.28));handle.add(handleStem);for(const y of [-.21,.21]){const end=new THREE.Mesh(new THREE.SphereGeometry(.07,24,14),solid(0xe9edf0,.28));end.scale.y=.72;end.position.y=y;handle.add(end)}g.add(handle);const tip=this.tubeBetween(new THREE.Vector3(buretteX,stopcockY-.07,.02),new THREE.Vector3(buretteX,1.86,.02),.045,glass);g.add(tip);const tipEnd=new THREE.Mesh(new THREE.CylinderGeometry(.026,.042,.24,28),glass);tipEnd.position.set(buretteX,1.75,.02);g.add(tipEnd);

    const flaskColour=state.complete?0xffb7d5:0xd5f2f3,flaskLevel=.34+Math.min(30,reading)*.0065,flask=this.flask(flaskLevel,flaskColour);flask.scale.setScalar(.72);flask.position.set(.06,.17,.1);g.add(flask);this.dynamic.push({kind:'titrationSwirl',group:flask,baseX:.06,baseY:.17,baseZ:.1});
    const pinkBurst=new THREE.Group(),pinkCoreMat=new THREE.MeshBasicMaterial({color:0xff4f9c,transparent:true,opacity:0,depthWrite:false,toneMapped:false}),pinkWispMat=new THREE.MeshBasicMaterial({color:0xf06aa9,transparent:true,opacity:0,depthWrite:false,toneMapped:false}),pinkRingMat=new THREE.MeshBasicMaterial({color:0xff9bc8,transparent:true,opacity:0,depthWrite:false,toneMapped:false}),pinkCore=new THREE.Mesh(new THREE.SphereGeometry(.18,32,18),pinkCoreMat);pinkCore.scale.set(1,.09,.82);pinkCore.renderOrder=18;pinkBurst.add(pinkCore);const pinkRing=new THREE.Mesh(new THREE.TorusGeometry(.1,.012,10,42),pinkRingMat);pinkRing.rotation.x=Math.PI/2;pinkRing.position.y=.008;pinkRing.renderOrder=19;pinkBurst.add(pinkRing);const pinkWisps=[];for(let i=0;i<7;i++){const wisp=new THREE.Mesh(new THREE.SphereGeometry(.046+(i%3)*.008,22,14),pinkWispMat),angle=i/7*Math.PI*2+.28;wisp.userData={angle,reach:.13+(i%3)*.035,sink:.035+(i%2)*.025};wisp.scale.set(1.7,.34,.62);wisp.rotation.y=-angle;wisp.renderOrder=18;pinkBurst.add(wisp);pinkWisps.push(wisp)}pinkBurst.position.set(0,.075+flaskLevel*.72,.015);pinkBurst.visible=false;flask.add(pinkBurst);this.dynamic.push({kind:'titrationPinkBurst',group:pinkBurst,core:pinkCore,ring:pinkRing,wisps:pinkWisps,coreMat:pinkCoreMat,ringMat:pinkRingMat,wispMat:pinkWispMat,surfaceY:.075+flaskLevel*.72});
    const flow=this.liquidPourStream(new THREE.Vector3(buretteX,1.62,.02),new THREE.Vector3(.06,1.58,.1),{color:0xbcefff,time:state.time||0,radius:.021,opacity:.78,sag:.006,breakup:.42,droplets:6,splash:true});flow.visible=false;g.add(flow);const dropMat=new THREE.MeshPhysicalMaterial({color:0xe4fcff,transparent:true,opacity:.9,roughness:.04,transmission:.35,ior:1.333,clearcoat:1,depthWrite:false}),drop=new THREE.Mesh(new THREE.SphereGeometry(.036,22,14),dropMat);drop.position.set(buretteX,1.62,.04);drop.scale.set(.78,1.3,.78);drop.visible=false;drop.renderOrder=14;g.add(drop);const endpointRing=new THREE.Mesh(new THREE.TorusGeometry(.04,.005,8,32),new THREE.MeshBasicMaterial({color:0xf1fdff,transparent:true,opacity:0,depthWrite:false,toneMapped:false}));endpointRing.rotation.x=Math.PI/2;endpointRing.position.set(.06,1.58,.1);endpointRing.visible=false;endpointRing.renderOrder=15;g.add(endpointRing);this.dynamic.push({kind:'titrationFlow',liquid,meniscus,bottomY:liquidBottomY,maxHeight:liquidMaxHeight,flow,drop,endpointRing});

    const amber=new THREE.MeshPhysicalMaterial({color:0x9c5728,transparent:true,opacity:.72,roughness:.22,transmission:.12,clearcoat:.45}),bottle=new THREE.Group(),bottleBody=cylinder(.24,.62,amber,48);bottleBody.position.y=.36;bottle.add(bottleBody);const shoulder=new THREE.Mesh(new THREE.SphereGeometry(.24,48,20),amber);shoulder.scale.y=.55;shoulder.position.y=.66;bottle.add(shoulder);const neck=cylinder(.11,.22,amber,36);neck.position.y=.82;bottle.add(neck);const nozzle=new THREE.Mesh(new THREE.CylinderGeometry(.035,.072,.18,28),new THREE.MeshPhysicalMaterial({color:0xf2f4ed,transparent:true,opacity:.82,roughness:.18,transmission:.12}));nozzle.position.y=.98;nozzle.visible=false;bottle.add(nozzle);const capGroup=new THREE.Group(),cap=cylinder(.15,.18,solid(0xf1f0e9,.42),40);cap.position.y=.98;capGroup.add(cap);for(let i=0;i<8;i++){const ridge=new THREE.Mesh(new THREE.BoxGeometry(.015,.14,.025),solid(0xd7d7d0,.5));const a=i/8*Math.PI*2;ridge.position.set(Math.cos(a)*.145,.98,Math.sin(a)*.145);ridge.rotation.y=-a;capGroup.add(ridge)}bottle.add(capGroup);const labelCanvas=document.createElement('canvas'),lc=labelCanvas.getContext('2d');labelCanvas.width=1024;labelCanvas.height=220;lc.fillStyle='#fffdf4';lc.fillRect(0,0,1024,220);lc.fillStyle='#a7376d';lc.font='800 56px Inter, sans-serif';lc.textAlign='center';lc.textBaseline='middle';lc.fillText('PHENOLPHTHALEIN',512,86);lc.fillStyle='#4f5e62';lc.font='600 38px Inter, sans-serif';lc.fillText('INDICATOR',512,155);const labelTexture=new THREE.CanvasTexture(labelCanvas);labelTexture.colorSpace=THREE.SRGBColorSpace;labelTexture.anisotropy=Math.min(8,this.renderer.capabilities.getMaxAnisotropy());const bottleLabel=new THREE.Mesh(new THREE.CylinderGeometry(.245,.245,.18,64,1,true),new THREE.MeshBasicMaterial({map:labelTexture,side:THREE.DoubleSide,toneMapped:false}));bottleLabel.position.y=.42;bottleLabel.rotation.y=Math.PI;bottleLabel.renderOrder=10;bottle.add(bottleLabel);const bottleStart=new THREE.Vector3(1.62,.17,.17);bottle.position.copy(bottleStart);bottle.scale.setScalar(.78);g.add(bottle);const indicatorDropMat=new THREE.MeshPhysicalMaterial({color:0xec8bbb,transparent:true,opacity:.9,roughness:.05,transmission:.18,clearcoat:.7,depthWrite:false}),indicatorDrops=[];for(let i=0;i<2;i++){const indicatorDrop=new THREE.Mesh(new THREE.SphereGeometry(.029,20,14),indicatorDropMat);indicatorDrop.scale.set(.78,1.32,.78);indicatorDrop.visible=false;indicatorDrop.renderOrder=16;g.add(indicatorDrop);indicatorDrops.push(indicatorDrop)}this.dynamic.push({kind:'titrationIndicator',group:bottle,cap:capGroup,nozzle,drops:indicatorDrops,start:bottleStart,pour:new THREE.Vector3(.84,1.9,.14),duration:3.2});
    g.position.z=.62;g.userData.titrationRig=true;return shadowReady(g)
  }
  tripod(){const g=new THREE.Group(),frameMat=metal(0x596b71,.3),gauzeMat=metal(0xb9c4c7,.44),y=1.82;for(const z of [-.7,.7]){const rail=new THREE.Mesh(new THREE.BoxGeometry(1.92,.06,.06),frameMat);rail.position.set(0,y,z);g.add(rail)}for(const x of [-.94,.94]){const rail=new THREE.Mesh(new THREE.BoxGeometry(.06,.06,1.45),frameMat);rail.position.set(x,y,0);g.add(rail)}for(let i=-7;i<=7;i++){const gx=new THREE.Mesh(new THREE.BoxGeometry(1.82,.014,.018),gauzeMat);gx.position.set(0,y+.038,i*.09);g.add(gx);const gz=new THREE.Mesh(new THREE.BoxGeometry(.018,.014,1.34),gauzeMat);gz.position.set(i*.12,y+.04,0);g.add(gz)}const centre=new THREE.Mesh(new THREE.PlaneGeometry(1.55,1.13),new THREE.MeshStandardMaterial({color:0xbac3c4,roughness:.82,metalness:.2,transparent:true,opacity:.18,side:THREE.DoubleSide}));centre.rotation.x=-Math.PI/2;centre.position.y=y+.025;g.add(centre);const legMat=metal(0x43545a,.26),pairs=[[new THREE.Vector3(-.72,y,-.48),new THREE.Vector3(-1.16,.05,-.88)],[new THREE.Vector3(.72,y,-.48),new THREE.Vector3(1.16,.05,-.88)],[new THREE.Vector3(-.72,y,.48),new THREE.Vector3(-1.16,.05,.88)],[new THREE.Vector3(.72,y,.48),new THREE.Vector3(1.16,.05,.88)]];for(const [a,b] of pairs){g.add(this.tubeBetween(a,b,.05,legMat));const foot=cylinder(.13,.05,legMat,32);foot.position.copy(b);foot.position.y=.025;g.add(foot)}return shadowReady(g)}
  crucible({burning=false,lidOn=true,product=false,empty=false,productColor=0xf6f5ec,productScale=1}={}){const g=new THREE.Group(),ceramic=new THREE.MeshPhysicalMaterial({color:0xf0ead8,roughness:.5,metalness:0,clearcoat:.18,clearcoatRoughness:.45}),innerMat=solid(0x85847d,.94);const bowl=new THREE.Mesh(new THREE.CylinderGeometry(.47,.32,.34,80,2,true),ceramic);bowl.position.y=.2;g.add(bowl);const base=cylinder(.32,.07,ceramic,64);base.position.y=.035;g.add(base);const interior=cylinder(.385,.035,innerMat,72);interior.position.y=.38;g.add(interior);const rim=new THREE.Mesh(new THREE.TorusGeometry(.47,.043,18,80),ceramic);rim.rotation.x=Math.PI/2;rim.position.y=.39;g.add(rim);if(product&&productScale>0){const oxideMat=solid(productColor,.9);for(let i=0;i<34;i++){const a=i*2.399,r=(.055+(i%7)*.043)*productScale,flake=new THREE.Mesh(new THREE.DodecahedronGeometry((.026+(i%4)*.009)*productScale,0),oxideMat);flake.position.set(Math.cos(a)*r,.39+(.017+(i%5)*.009)*productScale,Math.sin(a)*r);flake.scale.set(1.7,.42,.95);flake.rotation.set(i*.71,i*.38,i*.53);g.add(flake)}}else if(!empty&&!product){const vertices=[],indices=[],turns=1.7,segments=96;for(let i=0;i<=segments;i++){const t=i/segments,a=.2+t*Math.PI*2*turns,r=.055+t*.27,width=.027;for(const edge of [-1,1]){vertices.push(Math.cos(a)*(r+edge*width),.426+t*.007,Math.sin(a)*(r+edge*width))}}for(let i=0;i<segments;i++){const k=i*2;indices.push(k,k+1,k+2,k+1,k+3,k+2)}const ribbonGeometry=new THREE.BufferGeometry();ribbonGeometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));ribbonGeometry.setIndex(indices);ribbonGeometry.computeVertexNormals();const ribbonMat=new THREE.MeshStandardMaterial({color:0xe8edef,metalness:.96,roughness:.13,side:THREE.DoubleSide});const ribbon=new THREE.Mesh(ribbonGeometry,ribbonMat);g.add(ribbon);const end=new THREE.Mesh(new THREE.BoxGeometry(.13,.016,.055),ribbonMat);const a=.2+Math.PI*2*turns;end.position.set(Math.cos(a)*.34,.44,Math.sin(a)*.34);end.rotation.y=-a+.08;g.add(end)}const lid=new THREE.Group(),cap=cylinder(.49,.075,ceramic,80);cap.position.y=.035;lid.add(cap);const dome=new THREE.Mesh(new THREE.SphereGeometry(.49,80,32),ceramic);dome.scale.y=.13;dome.position.y=.07;lid.add(dome);const underRim=new THREE.Mesh(new THREE.TorusGeometry(.405,.025,14,72),ceramic);underRim.rotation.x=Math.PI/2;underRim.position.y=-.002;lid.add(underRim);const knob=cylinder(.095,.075,ceramic,48);knob.position.y=.155;lid.add(knob);const knobTop=new THREE.Mesh(new THREE.SphereGeometry(.098,40,20),ceramic);knobTop.scale.y=.35;knobTop.position.y=.195;lid.add(knobTop);if(lidOn)lid.position.set(0,.43,0);else{lid.position.set(.75,.115,.16);lid.rotation.z=-.1;lid.rotation.y=.24}g.add(lid);if(burning&&!lidOn){const addMat=(color,opacity)=>new THREE.MeshBasicMaterial({color,transparent:true,opacity,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false});const core=new THREE.Mesh(new THREE.SphereGeometry(.28,40,24),addMat(0xffffff,1));core.position.y=.44;core.scale.y=.48;const corona=new THREE.Mesh(new THREE.SphereGeometry(.52,40,24),addMat(0xeaf7ff,.5));corona.position.y=.47;corona.scale.y=.68;const light=new THREE.PointLight(0xffffff,16,6.5,1.25);light.position.y=.62;const sparks=[];for(let i=0;i<18;i++){const spark=new THREE.Mesh(new THREE.SphereGeometry(.017+(i%3)*.006,12,8),addMat(i%3===0?0xcfeaff:0xffffff,.95));spark.userData={phase:i/18,angle:i*2.399,speed:.72+(i%4)*.12};g.add(spark);sparks.push(spark)}g.add(core,corona,light);this.dynamic.push({kind:'magnesiumBurn',core,corona,light,sparks,seed:3.2})}return shadowReady(g)}
  balance(mass=0){const g=new THREE.Group(),dark=solid(0x172a33,.28),body=solid(0x334952,.24),trim=metal(0x9eacb0,.18),steel=metal(0xd7e0e2,.12);const plinth=new THREE.Mesh(new THREE.BoxGeometry(1.92,.16,1.18),dark);plinth.position.y=.08;g.add(plinth);const lower=new THREE.Mesh(new THREE.BoxGeometry(1.78,.42,1.08),body);lower.position.y=.35;g.add(lower);const shoulder=new THREE.Mesh(new THREE.BoxGeometry(1.63,.13,.94),solid(0x53676f,.22));shoulder.position.y=.625;g.add(shoulder);const pedestal=cylinder(.45,.14,trim,64);pedestal.position.y=.74;g.add(pedestal);const tray=cylinder(.62,.075,steel,80);tray.position.y=.845;g.add(tray);const trayRim=new THREE.Mesh(new THREE.TorusGeometry(.62,.027,14,80),steel);trayRim.rotation.x=Math.PI/2;trayRim.position.y=.89;g.add(trayRim);const bezel=new THREE.Mesh(new THREE.BoxGeometry(1.12,.3,.055),dark);bezel.position.set(0,.39,.57);g.add(bezel);const displayCanvas=document.createElement('canvas'),dc=displayCanvas.getContext('2d');displayCanvas.width=512;displayCanvas.height=128;dc.fillStyle='#071d20';dc.fillRect(0,0,512,128);dc.shadowColor='#77ffe1';dc.shadowBlur=18;dc.fillStyle='#83f7df';dc.font='700 70px ui-monospace, SFMono-Regular, Menlo, monospace';dc.textAlign='right';dc.textBaseline='middle';dc.fillText(`${Number(mass||0).toFixed(2)} g`,476,67);const displayTexture=new THREE.CanvasTexture(displayCanvas);displayTexture.colorSpace=THREE.SRGBColorSpace;const screen=new THREE.Mesh(new THREE.PlaneGeometry(.94,.205),new THREE.MeshBasicMaterial({map:displayTexture,toneMapped:false}));screen.position.set(0,.405,.601);g.add(screen);for(const x of [-.66,.66]){const button=cylinder(.105,.035,metal(x<0?0xc2c9ca:0x79b6aa,.22),32);button.rotation.x=Math.PI/2;button.position.set(x,.24,.574);g.add(button)}for(const x of [-.72,.72])for(const z of [-.42,.42]){const foot=cylinder(.09,.055,dark,28);foot.position.set(x,.03,z);g.add(foot)}const brandMat=new THREE.MeshBasicMaterial({color:0xd6e1e2});const brand=new THREE.Mesh(new THREE.PlaneGeometry(.42,.035),brandMat);brand.position.set(0,.575,.574);g.add(brand);return shadowReady(g)}
  measuringCylinder(level=.22){const g=new THREE.Group(),plastic=new THREE.MeshPhysicalMaterial({color:0xe7f6f8,transparent:true,opacity:.58,transmission:.42,roughness:.18,ior:1.47,thickness:.08,side:THREE.DoubleSide,depthWrite:false}),baseMat=new THREE.MeshPhysicalMaterial({color:0xdcebed,transparent:true,opacity:.82,roughness:.24,transmission:.18});const body=new THREE.Mesh(new THREE.CylinderGeometry(.31,.29,1.62,64,1,true),plastic);body.position.y=.86;g.add(body);const bottom=cylinder(.3,.055,baseMat,64);bottom.position.y=.05;g.add(bottom);const foot=cylinder(.43,.07,baseMat,64);foot.position.y=.035;g.add(foot);const rim=new THREE.Mesh(new THREE.TorusGeometry(.315,.025,14,64),plastic);rim.rotation.x=Math.PI/2;rim.position.y=1.68;g.add(rim);const liquidH=Math.max(.025,level*.78),acid=new THREE.Mesh(new THREE.CylinderGeometry(.255,.265,liquidH,64),new THREE.MeshPhysicalMaterial({color:0xc6eef3,transparent:true,opacity:.78,roughness:.09,transmission:.18}));acid.position.y=.1+liquidH/2;g.add(acid);const meniscus=cylinder(.258,.018,new THREE.MeshPhysicalMaterial({color:0xe7fbff,transparent:true,opacity:.72,roughness:.08}),64);meniscus.position.y=.1+liquidH;g.add(meniscus);const marks=new THREE.Group(),markMat=new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.95,depthWrite:false,depthTest:false,side:THREE.DoubleSide});for(let i=1;i<=9;i++){const width=i%2===0?.2:.12;const r=Math.hypot(.16,.255)+.002,arc=width/r;const mark=new THREE.Mesh(new THREE.CylinderGeometry(r,r,.018,32,1,true,-arc/2,arc),markMat);mark.position.set(0,.16+i*.15,0);mark.rotation.y=Math.atan2(.16,.255);mark.renderOrder=9;marks.add(mark)}g.add(marks);const shine=new THREE.Mesh(new THREE.PlaneGeometry(.035,1.26),new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.42,depthWrite:false}));shine.position.set(-.13,.87,.27);shine.renderOrder=8;g.add(shine);return shadowReady(g)}
  articulatedHydrogenHand(state){
    const hand=new THREE.Group(),skin=new THREE.MeshPhysicalMaterial({color:0xd8a47e,roughness:.52,metalness:0,clearcoat:.12,clearcoatRoughness:.4,sheen:.28,sheenColor:0xffd4ba}),skinLight=new THREE.MeshPhysicalMaterial({color:0xe1ad87,roughness:.49,metalness:0,clearcoat:.14,clearcoatRoughness:.36,sheen:.3,sheenColor:0xffdcc5}),creaseMat=new THREE.MeshBasicMaterial({color:0x9b604d,transparent:true,opacity:.28,depthWrite:false});
    const smoothPart=(points,radius,material=skin,segments=42)=>{const curve=new THREE.CatmullRomCurve3(points,false,'centripetal'),part=new THREE.Mesh(new THREE.TubeGeometry(curve,segments,radius,18,false),material);part.castShadow=true;part.receiveShadow=true;hand.add(part);return part};
    const rounded=(radius,scale,position,material=skin)=>{const part=new THREE.Mesh(new THREE.SphereGeometry(radius,40,28),material);part.scale.copy(scale);part.position.copy(position);hand.add(part);return part};
    const palm=rounded(1,new THREE.Vector3(.72,.46,.29),new THREE.Vector3(1.47,1.53,-.29));palm.rotation.z=-.035;
    const palmHeel=rounded(1,new THREE.Vector3(.43,.39,.27),new THREE.Vector3(1.76,1.47,-.3),skinLight);palmHeel.rotation.z=-.08;
    const wrist=new THREE.Mesh(new THREE.CapsuleGeometry(.27,.77,12,36),skin);wrist.rotation.z=Math.PI/2;wrist.position.set(2.16,1.49,-.31);wrist.scale.set(1,1,.96);hand.add(wrist);
    rounded(1,new THREE.Vector3(.34,.3,.24),new THREE.Vector3(1.3,1.76,-.19),skinLight);
    const fingerRows=[1.23,1.43,1.63,1.82],fingerRadii=[.078,.083,.086,.081],tipXs=[.31,.27,.24,.29];
    for(let i=0;i<4;i++){
      const y=fingerRows[i],radius=fingerRadii[i],z=-.285+i*.008,tip=new THREE.Vector3(tipXs[i],y-.02,-.055+i*.004),points=[new THREE.Vector3(1.2,y,z),new THREE.Vector3(.97,y+.012,-.335+i*.006),new THREE.Vector3(.68,y+.018,-.365+i*.005),new THREE.Vector3(.415,y-.004,-.255+i*.004),tip];
      smoothPart(points,radius,i===0?skinLight:skin,48);rounded(radius,new THREE.Vector3(1.04,1,.98),tip,i===0?skinLight:skin);
    }
    const clamp=value=>Math.max(0,Math.min(1,value)),smooth=value=>{value=clamp(value);return value*value*(3-2*value)},stage=state.hydrogenStage||0,t=state.hydrogenTimer||0;let sealRaw=0;
    if(stage===0||stage===2||stage===3)sealRaw=1;else if(stage===1)sealRaw=t<.48?1-t/.48:t<1.55?0:(t-1.55)/.52;else if(stage===4)sealRaw=1-t/.3;
    const sealQ=smooth(sealRaw),sealed=[new THREE.Vector3(1.31,1.76,-.17),new THREE.Vector3(1.2,1.96,-.13),new THREE.Vector3(1.01,2.15,-.07),new THREE.Vector3(.79,2.24,-.005),new THREE.Vector3(.65,2.24,.025)],open=[new THREE.Vector3(1.31,1.76,-.17),new THREE.Vector3(1.29,1.96,-.14),new THREE.Vector3(1.23,2.12,-.1),new THREE.Vector3(1.13,2.26,-.06),new THREE.Vector3(1.02,2.35,-.03)],thumbPoints=open.map((point,i)=>point.clone().lerp(sealed[i],sealQ));
    smoothPart(thumbPoints,.115,skinLight,52);rounded(.145,new THREE.Vector3(1.12,1,1),thumbPoints[0],skinLight);rounded(.115,new THREE.Vector3(1,.96,.96),thumbPoints[1],skinLight);rounded(.108,new THREE.Vector3(1,1,1),thumbPoints.at(-1),skinLight);
    const creaseCurves=[[new THREE.Vector3(1.17,1.5,-.015),new THREE.Vector3(1.42,1.43,-.006),new THREE.Vector3(1.66,1.48,-.002)],[new THREE.Vector3(1.13,1.64,-.012),new THREE.Vector3(1.39,1.57,-.002),new THREE.Vector3(1.61,1.61,0)],[new THREE.Vector3(1.36,1.72,-.005),new THREE.Vector3(1.5,1.82,-.002),new THREE.Vector3(1.65,1.8,-.008)]];
    for(const points of creaseCurves){const crease=new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points,false,'centripetal'),24,.008,8,false),creaseMat);crease.renderOrder=8;hand.add(crease)}
    hand.userData.articulatedHand=true;return shadowReady(hand)
  }
  hydrogenRig(state){
    const g=new THREE.Group(),stage=state.hydrogenStage||0,t=state.hydrogenTimer||0,tubeX=.65,glass=GLASS();
    const tube=new THREE.Group(),wall=new THREE.Mesh(new THREE.CylinderGeometry(.27,.27,1.78,56,1,true),glass);wall.position.y=1.02;tube.add(wall);const bottom=new THREE.Mesh(new THREE.SphereGeometry(.27,56,28,0,Math.PI*2,Math.PI/2,Math.PI/2),glass);bottom.scale.y=1.14;bottom.position.y=.145;tube.add(bottom);const bottomRim=new THREE.Mesh(new THREE.TorusGeometry(.215,.018,12,64),glass);bottomRim.rotation.x=Math.PI/2;bottomRim.position.y=.155;tube.add(bottomRim);const rim=new THREE.Mesh(new THREE.TorusGeometry(.28,.028,14,64),glass);rim.rotation.x=Math.PI/2;rim.position.y=1.92;tube.add(rim);const lip=new THREE.Mesh(new THREE.TorusGeometry(.315,.024,14,64),glass);lip.rotation.x=Math.PI/2;lip.position.y=1.92;tube.add(lip);
    const acidQ=stage===0?0:stage===1?Math.min(1,t/2.25):1,liquidH=.04+acidQ*.38;if(acidQ>.02){const liquid=cylinder(.225,liquidH,new THREE.MeshPhysicalMaterial({color:0xbfeaf0,transparent:true,opacity:.72,roughness:.12,transmission:.16}),56);liquid.position.y=.16+liquidH/2;tube.add(liquid);const meniscus=cylinder(.226,.016,new THREE.MeshPhysicalMaterial({color:0xe9fbff,transparent:true,opacity:.62}),56);meniscus.position.y=.16+liquidH;tube.add(meniscus)}
    const ribbonMat=new THREE.MeshPhysicalMaterial({color:0xeaf0f1,metalness:.62,roughness:.12,clearcoat:.7});for(let i=0;i<3;i++){const coil=new THREE.Mesh(new THREE.TorusGeometry(.115+i*.025,.015,10,48,Math.PI*1.75),ribbonMat);coil.rotation.x=Math.PI/2;coil.rotation.z=i*.85;coil.position.set(0,.18+i*.035,0);tube.add(coil)}
    if(stage===1||stage===2){const bubbleMat=new THREE.MeshBasicMaterial({color:0xf4feff,transparent:true,opacity:.82,depthWrite:false});for(let i=0;i<18;i++){const phase=(state.time*(.42+(i%5)*.065)+i*.137)%1,a=i*2.399,r=.035+(i%4)*.036,bubble=new THREE.Mesh(new THREE.SphereGeometry(.022+(i%3)*.01,12,8),bubbleMat);bubble.position.set(Math.cos(a)*r,.33+phase*1.32,Math.sin(a)*r);tube.add(bubble)}}
    if(stage>=2&&stage<=4){const gasHeight=1.25,gas=new THREE.Mesh(new THREE.CylinderGeometry(.22,.22,gasHeight,48),new THREE.MeshBasicMaterial({color:0xa8e8f3,transparent:true,opacity:.055+Math.min(1,(state.hydrogenGas||0)/40)*.07,depthWrite:false}));gas.position.y=.55+gasHeight/2;tube.add(gas)}tube.position.set(tubeX,.22,.02);g.add(tube,this.articulatedHydrogenHand(state));
    const pourQ=stage===1?Math.min(1,t/2.25):stage>1?1:0,lift=Math.min(1,pourQ/.24),retreat=Math.max(0,Math.min(1,(pourQ-.82)/.18)),cylPos=new THREE.Vector3(-1.8,.22,.1).lerp(new THREE.Vector3(-1.35,1.34,.05),lift);cylPos.lerp(new THREE.Vector3(-1.8,.22,.1),retreat);const measure=this.measuringCylinder(stage===0?.28:Math.max(.015,.28*(1-pourQ)));measure.position.copy(cylPos);measure.rotation.z=-1.08*lift*(1-retreat);g.add(measure);if(stage===1&&pourQ>.2&&pourQ<.86){const start=new THREE.Vector3(.08,2.35,.34),end=new THREE.Vector3(.65,2.08,.28);g.add(this.liquidPourStream(start,end,{color:0xb8f1ff,time:t,radius:.052,opacity:.76,sag:.04,breakup:.64,droplets:5,splash:true}))}
    if(stage===4){const approach=Math.min(1,t/.34),tip=new THREE.Vector3(-.78+1.38*approach,2.25,.08),handle=tip.clone().add(new THREE.Vector3(-1.55,.34,.03)),wood=this.tubeBetween(handle,tip,.025,new THREE.MeshStandardMaterial({color:0xb57a3a,roughness:.72}));g.add(wood);const ember=new THREE.Mesh(new THREE.SphereGeometry(.06,24,16),new THREE.MeshBasicMaterial({color:0xffd37a,toneMapped:false}));ember.position.copy(tip);g.add(ember);const splintFlame=new THREE.Mesh(new THREE.ConeGeometry(.075,.25,32),new THREE.MeshBasicMaterial({color:0xff8b32,transparent:true,opacity:.92,blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false}));splintFlame.position.copy(tip).add(new THREE.Vector3(0,.14,0));g.add(splintFlame);if(t>.36&&t<.88){const q=(t-.36)/.52,puff=new THREE.Mesh(new THREE.SphereGeometry(.22,32,20),new THREE.MeshBasicMaterial({color:q<.45?0xffdd88:0x72cfff,transparent:true,opacity:.72*(1-q),blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false}));puff.position.set(tubeX,2.24+q*.32,.02);puff.scale.set(1+q*1.6,.65+q,.8+q);g.add(puff);const frontQ=Math.max(0,Math.min(1,(t-.4)/.43)),front=new THREE.Mesh(new THREE.SphereGeometry(.19,32,18),new THREE.MeshBasicMaterial({color:frontQ<.55?0x4baeff:0xffd478,transparent:true,opacity:.88*(1-frontQ*.35),blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false}));front.scale.set(.82,1.25,.82);front.position.set(tubeX,.5+frontQ*1.55,.02);g.add(front);const flash=new THREE.PointLight(0xffc76f,8*(1-q),4,1.5);flash.position.copy(front.position);g.add(flash)}}
    return shadowReady(g)
  }
  thermometer(temperature=20){const g=new THREE.Group(),glass=new THREE.MeshPhysicalMaterial({color:0xeaf7f8,transparent:true,opacity:.42,transmission:.52,roughness:.08,ior:1.46,thickness:.06,clearcoat:.55,side:THREE.DoubleSide,depthWrite:false}),red=new THREE.MeshPhysicalMaterial({color:0xd6343d,roughness:.18,metalness:.12,clearcoat:.45}),white=new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.92,depthWrite:false}),q=Math.max(0,Math.min(1,(temperature-20)/28)),columnH=.36+q*2.55;
    const sheath=new THREE.Mesh(new THREE.CylinderGeometry(.078,.078,3.35,48,1,true),glass);sheath.position.y=1.725;g.add(sheath);const topRing=new THREE.Mesh(new THREE.TorusGeometry(.078,.012,10,40),glass);topRing.rotation.x=Math.PI/2;topRing.position.y=3.4;g.add(topRing);
    const column=cylinder(.026,columnH,red,24);column.position.y=.11+columnH/2;g.add(column);const bulb=new THREE.Mesh(new THREE.SphereGeometry(.105,32,20),red);bulb.scale.set(1,.9,1);bulb.position.y=.095;g.add(bulb);
    for(let i=0;i<=20;i++){const major=i%5===0,arc=Math.PI*(major?.58:.38),geometry=new THREE.TorusGeometry(.082,major?.009:.006,8,20,arc);geometry.rotateZ(Math.PI/2-arc/2);const band=new THREE.Mesh(geometry,white);band.rotation.x=Math.PI/2;band.position.y=.34+i*.145;band.renderOrder=8;g.add(band)}
    const shine=new THREE.Mesh(new THREE.PlaneGeometry(.018,2.96),new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.58,depthWrite:false}));shine.position.set(-.043,1.78,.071);shine.renderOrder=9;g.add(shine);
    return shadowReady(g)
  }
  ratesCrossPaper(){const g=new THREE.Group(),paperMat=new THREE.MeshStandardMaterial({color:0xfffdf1,roughness:.92,metalness:0,side:THREE.DoubleSide}),inkMat=new THREE.MeshStandardMaterial({color:0x11191c,roughness:.84,metalness:0});const paper=new THREE.Mesh(new THREE.BoxGeometry(1.62,.025,1.34),paperMat);paper.position.y=.115;g.add(paper);for(const angle of [Math.PI/4,-Math.PI/4]){const stroke=new THREE.Mesh(new THREE.BoxGeometry(1.4,.018,.105),inkMat);stroke.rotation.y=angle;stroke.position.y=.142;g.add(stroke)}const curl=new THREE.Mesh(new THREE.TorusGeometry(.72,.012,6,60,Math.PI*.45),new THREE.MeshBasicMaterial({color:0xe3dfcd,transparent:true,opacity:.55}));curl.rotation.set(Math.PI/2,0,Math.PI*.27);curl.position.set(-.06,.148,.04);g.add(curl);return shadowReady(g)}
  electricWaterBath(temperature=20,target=20,active=false){
    const g=new THREE.Group(),bathW=2.08,bathD=1.54,bodyMat=new THREE.MeshPhysicalMaterial({color:0xf7f8f6,roughness:.24,metalness:.04,clearcoat:.72,clearcoatRoughness:.15}),rimMat=new THREE.MeshPhysicalMaterial({color:0xffffff,roughness:.2,metalness:.02,clearcoat:.8,clearcoatRoughness:.12}),steelMat=metal(0xc4d0d3,.16),dark=solid(0x152830,.55),waterMat=new THREE.MeshPhysicalMaterial({color:0x55b9d2,transparent:true,opacity:.58,roughness:.08,transmission:.23,clearcoat:.8,depthWrite:false});
    const bodyHeight=1.00;
    const base=new THREE.Mesh(roundedBox(bathW,bodyHeight,bathD,.045),bodyMat);base.position.y=bodyHeight/2;g.add(base);
    const well=new THREE.Mesh(new THREE.BoxGeometry(1.76,.34,1.22),rimMat);well.position.y=.83;g.add(well);
    const waterVolume=new THREE.Mesh(new THREE.BoxGeometry(1.68,.23,1.14),waterMat);waterVolume.position.y=.815;waterVolume.renderOrder=2;g.add(waterVolume);
    const water=new THREE.Mesh(new THREE.BoxGeometry(1.68,.025,1.14),new THREE.MeshPhysicalMaterial({color:0x71d2e4,transparent:true,opacity:.66,roughness:.06,transmission:.28,clearcoat:.9,depthWrite:false}));water.position.y=.937;water.renderOrder=3;g.add(water);
    const panel=new THREE.Mesh(roundedBox(.96,.34,.05,.025),dark);panel.position.set(0,.3,bathD/2+.031);g.add(panel);
    const displayCanvas=document.createElement('canvas'),dc=displayCanvas.getContext('2d');displayCanvas.width=512;displayCanvas.height=160;dc.fillStyle='#071d20';dc.fillRect(0,0,512,160);dc.shadowColor='#71ffe8';dc.shadowBlur=18;dc.fillStyle='#83f7df';dc.font='800 66px ui-monospace, SFMono-Regular, Menlo, monospace';dc.textAlign='center';dc.textBaseline='middle';dc.fillText(`${temperature.toFixed(1)} °C`,256,65);dc.shadowBlur=0;dc.fillStyle='#b8c6c8';dc.font='700 27px Inter, sans-serif';dc.fillText(`SET ${target.toFixed(0)} °C`,256,128);
    const texture=new THREE.CanvasTexture(displayCanvas);texture.colorSpace=THREE.SRGBColorSpace;const display=new THREE.Mesh(new THREE.PlaneGeometry(.76,.26),new THREE.MeshBasicMaterial({map:texture,toneMapped:false}));display.position.set(0,.31,bathD/2+.058);g.add(display);
    const indicator=new THREE.Mesh(new THREE.SphereGeometry(.048,20,12),new THREE.MeshBasicMaterial({color:active?0xff7b3d:0x41d38b,toneMapped:false}));indicator.scale.z=.32;indicator.position.set(.68,.31,bathD/2+.067);g.add(indicator);
    const dial=cylinder(.1,.06,steelMat,32);dial.rotation.x=Math.PI/2;dial.position.set(-.68,.31,bathD/2+.063);g.add(dial);
    for(const x of [-.72,.72])for(const z of [-.55,.55]){const foot=new THREE.Mesh(roundedBox(.2,.07,.17,.015),dark);foot.position.set(x,.035,z);g.add(foot)}
    const bathThermometer=this.thermometer(temperature);bathThermometer.scale.setScalar(.54);bathThermometer.position.set(.55,.68,.02);bathThermometer.rotation.z=-.06;g.add(bathThermometer);
    const heaterLight=new THREE.PointLight(0xff7048,active?2.4:.25,2.2,1.7);heaterLight.position.set(0,.5,0);g.add(heaterLight);this.dynamic.push({kind:'bathWater',surface:water,indicator,light:heaterLight,active,baseY:.937});g.userData.electricWaterBath=true;return shadowReady(g)
  }
  ratesSulfurCloud(progress=0){const g=new THREE.Group(),q=Math.max(0,Math.min(1,progress)),hazeMat=new THREE.MeshPhysicalMaterial({color:0xe8d76d,transparent:true,opacity:.06+q*.58,roughness:.72,transmission:.04,depthWrite:false}),haze=cylinder(.54,.35,hazeMat,64);haze.position.y=.25;g.add(haze);const flakeMat=new THREE.MeshBasicMaterial({color:0xffef9b,transparent:true,opacity:.12+q*.68,depthWrite:false});for(let i=0;i<46;i++){const a=i*2.399,r=.04+(i%9)*.052,flake=new THREE.Mesh(new THREE.SphereGeometry(.012+(i%3)*.006,10,7),flakeMat);flake.position.set(Math.cos(a)*r,.1+((i*7)%23)/23*.45,Math.sin(a)*r);flake.scale.set(1.4,.55,1);g.add(flake)}return g}
  meter(){const g=new THREE.Group();const body=new THREE.Mesh(new THREE.BoxGeometry(.85,1.15,.42),solid(0x263d47,.3));body.position.y=.6;g.add(body);const screen=new THREE.Mesh(new THREE.PlaneGeometry(.56,.3),new THREE.MeshBasicMaterial({color:0x54d995}));screen.position.set(0,.73,.216);g.add(screen);const probe=cylinder(.035,1.3,metal(0x9eacb0),16);probe.position.set(.65,.22,0);g.add(probe);return shadowReady(g)}
  electrolysisRig(state){
    const g=new THREE.Group(),graphite=new THREE.MeshPhysicalMaterial({color:0x252b2d,roughness:.64,metalness:.12,clearcoat:.12}),copper=new THREE.MeshPhysicalMaterial({color:0xd47a3d,roughness:.4,metalness:.5,clearcoat:.34,emissive:0x321006,emissiveIntensity:.08}),steel=metal(0xb8c3c6,.18),blackLead=new THREE.MeshStandardMaterial({color:0x15191c,roughness:.58,metalness:.02}),redLead=new THREE.MeshStandardMaterial({color:0xc93332,roughness:.5,metalness:.02}),cathodeX=-.36,anodeX=.36,electrodeZ=.13;let cathodeRod=null,cathodeBand=null;
    const cell=this.beaker(.65,0x2597b7);cell.scale.setScalar(1.08);cell.position.set(0,0,.12);g.add(cell);
    for(const [x,isCathode] of [[cathodeX,true],[anodeX,false]]){
      const rod=cylinder(.047,1.78,graphite,24);rod.position.set(x,.9,electrodeZ);g.add(rod);
      const band=new THREE.Mesh(new THREE.TorusGeometry(.054,.012,9,30),new THREE.MeshStandardMaterial({color:isCathode?0x1c2226:0xd83c3a,roughness:.48}));band.rotation.x=Math.PI/2;band.position.set(x,1.39,electrodeZ);g.add(band);
      if(isCathode){cathodeRod=rod;cathodeBand=band}
    }
    const crocodileClip=(x,colorMat)=>{
      const clip=new THREE.Group();clip.position.set(x,1.57,electrodeZ);
      for(const side of [-1,1]){const jaw=new THREE.Mesh(new THREE.BoxGeometry(.105,.3,.047),steel);jaw.position.set(side*.027,.015,side*.034);jaw.rotation.z=side*.08;clip.add(jaw);for(let i=0;i<3;i++){const tooth=new THREE.Mesh(new THREE.BoxGeometry(.072,.025,.028),steel);tooth.position.set(side*.027,-.125+i*.052,side*.068);tooth.rotation.z=side*.08;clip.add(tooth)}}
      const hinge=cylinder(.088,.17,steel,28);hinge.rotation.z=Math.PI/2;hinge.position.y=.12;clip.add(hinge);
      const handle=new THREE.Mesh(new THREE.CapsuleGeometry(.092,.25,8,24),colorMat);handle.position.y=.34;clip.add(handle);
      const collar=cylinder(.105,.12,colorMat,28);collar.position.y=.53;clip.add(collar);
      return clip;
    };
    const cathodeClip=crocodileClip(cathodeX,blackLead),anodeClip=crocodileClip(anodeX,redLead);g.add(cathodeClip,anodeClip);

    const supply=new THREE.Group(),caseMat=new THREE.MeshStandardMaterial({color:0x294550,roughness:.36,metalness:.24}),panelMat=new THREE.MeshStandardMaterial({color:0x172a31,roughness:.42,metalness:.18});
    const body=new THREE.Mesh(new THREE.BoxGeometry(2.45,.96,.76),caseMat);supply.add(body);
    const top=new THREE.Mesh(new THREE.BoxGeometry(2.28,.09,.65),metal(0x43636d,.28));top.position.y=.515;supply.add(top);
    const panel=new THREE.Mesh(new THREE.BoxGeometry(2.15,.7,.045),panelMat);panel.position.z=.4;supply.add(panel);
    const displayCanvas=document.createElement('canvas'),dc=displayCanvas.getContext('2d');displayCanvas.width=512;displayCanvas.height=160;dc.fillStyle='#061719';dc.fillRect(0,0,512,160);dc.shadowColor=state.running?'#6dffe0':'#7c9697';dc.shadowBlur=18;dc.fillStyle=state.running?'#86ffe3':'#9cadad';dc.font='800 61px ui-monospace, SFMono-Regular, Menlo, monospace';dc.textAlign='center';dc.textBaseline='middle';dc.fillText(state.running?'6.0 V  ON':'0.0 V  OFF',256,78);dc.shadowBlur=0;dc.fillStyle='#a9b9bb';dc.font='700 25px Inter, sans-serif';dc.fillText('D.C. POWER SUPPLY',256,133);const displayTexture=new THREE.CanvasTexture(displayCanvas);displayTexture.colorSpace=THREE.SRGBColorSpace;const screen=new THREE.Mesh(new THREE.PlaneGeometry(1.3,.405),new THREE.MeshBasicMaterial({map:displayTexture,toneMapped:false}));screen.position.set(0,.12,.427);supply.add(screen);
    for(const [x,color] of [[-.72,0x171b1e],[.72,0xd43d3a]]){const socket=new THREE.Mesh(new THREE.TorusGeometry(.115,.035,12,40),new THREE.MeshStandardMaterial({color,roughness:.3,metalness:.32}));socket.position.set(x,-.27,.431);supply.add(socket);const post=cylinder(.058,.15,metal(0xd5dcdd,.15),28);post.rotation.x=Math.PI/2;post.position.set(x,-.27,.47);supply.add(post)}
    const rocker=new THREE.Mesh(new THREE.BoxGeometry(.25,.17,.065),new THREE.MeshStandardMaterial({color:state.running?0x2cbf7a:0x495c61,roughness:.3}));rocker.position.set(1.0,.17,.43);rocker.rotation.x=state.running?-.12:.12;supply.add(rocker);const indicator=new THREE.Mesh(new THREE.SphereGeometry(.043,20,12),new THREE.MeshBasicMaterial({color:state.running?0x62ff9e:0x502c2b,toneMapped:false}));indicator.scale.z=.35;indicator.position.set(1.0,-.05,.438);supply.add(indicator);
    for(const x of [-.92,.92]){const foot=new THREE.Mesh(new THREE.BoxGeometry(.22,.08,.5),blackLead);foot.position.set(x,-.52,0);supply.add(foot)}
    supply.position.set(0,2.57,-.82);g.add(supply);

    const leadCurve=(points,material)=>new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points,false,'centripetal'),64,.043,16,false),material);
    const cathodeWire=leadCurve([new THREE.Vector3(cathodeX,2.11,electrodeZ),new THREE.Vector3(-.84,2.18,.3),new THREE.Vector3(-1.13,2.38,-.04),new THREE.Vector3(-.72,2.3,-.29)],blackLead);
    const anodeWire=leadCurve([new THREE.Vector3(anodeX,2.11,electrodeZ),new THREE.Vector3(.84,2.18,.3),new THREE.Vector3(1.13,2.38,-.04),new THREE.Vector3(.72,2.3,-.29)],redLead);g.add(cathodeWire,anodeWire);

    if(state.running){const chlorine=new THREE.Group(),bubbleMat=new THREE.MeshBasicMaterial({color:0xf4ffd0,transparent:true,opacity:.82,depthWrite:false,toneMapped:false});for(let i=0;i<24;i++){const bubble=new THREE.Mesh(new THREE.SphereGeometry(.026+(i%4)*.008,14,10),bubbleMat),angle=i*2.399,r=.025+(i%4)*.024;bubble.position.set(Math.cos(angle)*r,.1+((i*.173)%1)*.7,Math.sin(angle)*r);bubble.userData.baseY=.08;chlorine.add(bubble);this.dynamic.push({kind:'bubble',mesh:bubble,height:.72,speed:.25+(i%5)*.055,phase:(i*.173)%1})}chlorine.position.set(anodeX,.1,electrodeZ+.015);g.add(chlorine)}
    const maxHeight=.72,baseY=.14,sleeve=new THREE.Mesh(new THREE.CylinderGeometry(.075,.07,maxHeight,34),copper);sleeve.position.set(cathodeX,baseY+.005,electrodeZ+.006);sleeve.scale.y=.01/maxHeight;sleeve.visible=false;g.add(sleeve);
    const nodules=[];for(let i=0;i<34;i++){const angle=i*2.399,r=.078+(i%3)*.007,nodule=new THREE.Mesh(new THREE.SphereGeometry(.027+(i%4)*.006,16,10),copper.clone());nodule.position.set(cathodeX+Math.cos(angle)*r,baseY+.045+(i%10)*.064,electrodeZ+Math.sin(angle)*r);nodule.scale.setScalar(.001);g.add(nodule);nodules.push({mesh:nodule,threshold:.04+(i/33)*.79})}
    this.dynamic.push({kind:'electroCopper',sleeve,nodules,baseY,maxHeight,solution:cell.userData.liquidVolume,meniscus:cell.userData.liquidMeniscus,startColor:new THREE.Color(0x2597b7),endColor:new THREE.Color(0x83c7cc)});
    const balance=this.balance(0);balance.scale.setScalar(.78);balance.position.set(2.25,0,.13);g.add(balance);let balanceDisplay=null;balance.traverse(object=>{const texture=object.material?.map,canvas=texture?.image;if(!balanceDisplay&&canvas?.getContext)balanceDisplay={canvas,context:canvas.getContext('2d'),texture}});
    const movingCathode=new THREE.Group(),movingRod=cylinder(.047,1.78,graphite.clone(),24);movingCathode.add(movingRod);const movingCopper=new THREE.Mesh(new THREE.CylinderGeometry(.075,.07,maxHeight,34),copper.clone());movingCopper.position.y=baseY+maxHeight/2-.9;movingCathode.add(movingCopper);for(const {mesh} of nodules){const deposit=mesh.clone();deposit.position.set(mesh.position.x-cathodeX,mesh.position.y-.9,mesh.position.z-electrodeZ);deposit.scale.setScalar(.9);deposit.visible=true;movingCathode.add(deposit)}movingCathode.position.set(cathodeX,.9,electrodeZ);movingCathode.visible=false;g.add(movingCathode);
    this.dynamic.push({kind:'electroWeigh',movingCathode,cathodeRod,cathodeBand,cathodeClip,originalSleeve:sleeve,originalNodules:nodules,balanceDisplay,start:new THREE.Vector3(cathodeX,.9,electrodeZ),lifted:new THREE.Vector3(cathodeX,2.08,electrodeZ),aboveBalance:new THREE.Vector3(2.25,2.08,.13),onBalance:new THREE.Vector3(2.25,.755,.13),duration:4.8});
    return shadowReady(g)
  }
  displacementRig(state){
    const g=new THREE.Group(),glass=GLASS(),rackMat=new THREE.MeshPhysicalMaterial({color:0x31454d,roughness:.28,metalness:.62,clearcoat:.28}),rackEdge=metal(0xaebcc0,.17),rubber=solid(0x18262b,.82),xs=[-2.1,-.7,.7,2.1],tubeData=[
      {metal:'Mg',metalColor:0xd7dce0,start:0x248fcd,end:0xc3e8e3,deposit:0xb96636,rate:1},
      {metal:'Zn',metalColor:0xaeb9bd,start:0x248fcd,end:0xb8dedf,deposit:0xb96636,rate:.86},
      {metal:'Fe',metalColor:0x879298,start:0x248fcd,end:0x91c79e,deposit:0xb96636,rate:.68},
      {metal:'Cu',metalColor:0xc87945,start:0xe6f0ec,end:0x4a98c5,deposit:0xd9e0e2,rate:.8,silver:true}
    ];
    const base=new THREE.Mesh(new THREE.BoxGeometry(5.75,.12,1.28),rackMat);base.position.set(0,.07,.08);g.add(base);const inset=new THREE.Mesh(new THREE.BoxGeometry(5.34,.035,.9),rubber);inset.position.set(0,.145,.08);g.add(inset);
    for(const x of [-2.72,2.72]){const upright=new THREE.Mesh(new THREE.BoxGeometry(.13,1.78,.22),rackMat);upright.position.set(x,.95,-.2);g.add(upright);const foot=new THREE.Mesh(new THREE.BoxGeometry(.52,.09,.84),rubber);foot.position.set(x,.045,-.08);g.add(foot)}
    for(const [y,z] of [[.54,-.15],[1.72,-.2]]){const rail=new THREE.Mesh(new THREE.BoxGeometry(5.52,.16,.24),rackMat);rail.position.set(0,y,z);g.add(rail);const highlight=new THREE.Mesh(new THREE.BoxGeometry(5.32,.025,.026),rackEdge);highlight.position.set(0,y+.065,z+.128);g.add(highlight)}
    for(const x of xs){for(const y of [.54,1.72]){const collar=new THREE.Mesh(new THREE.TorusGeometry(.285,.035,12,48),rubber);collar.rotation.x=Math.PI/2;collar.position.set(x,y,.02);g.add(collar)}}
    tubeData.forEach((data,i)=>{
      const x=xs[i],tube=new THREE.Group(),shell=new THREE.Mesh(new THREE.CylinderGeometry(.25,.25,2.04,56,1,true),glass);shell.position.y=1.2;tube.add(shell);const bottom=new THREE.Mesh(new THREE.SphereGeometry(.25,56,24,0,Math.PI*2,Math.PI/2,Math.PI/2),glass);bottom.position.y=.18;tube.add(bottom);const rim=new THREE.Mesh(new THREE.TorusGeometry(.25,.032,16,64),glass);rim.rotation.x=Math.PI/2;rim.position.y=2.22;tube.add(rim);const innerRim=new THREE.Mesh(new THREE.TorusGeometry(.205,.012,10,48),new THREE.MeshBasicMaterial({color:0xe9fdff,transparent:true,opacity:.68,depthWrite:false,toneMapped:false}));innerRim.rotation.x=Math.PI/2;innerRim.position.y=2.223;tube.add(innerRim);
      const liquidMat=new THREE.MeshPhysicalMaterial({color:data.start,transparent:true,opacity:.72,roughness:.11,transmission:.14,clearcoat:.46,depthWrite:false}),meniscusMat=liquidMat.clone(),liquid=cylinder(.214,.94,liquidMat,56);liquid.position.y=.67;tube.add(liquid);const liquidBottom=new THREE.Mesh(new THREE.SphereGeometry(.214,48,20,0,Math.PI*2,Math.PI/2,Math.PI/2),liquidMat);liquidBottom.position.y=.2;tube.add(liquidBottom);const meniscus=cylinder(.216,.022,meniscusMat,56);meniscus.position.y=1.14;tube.add(meniscus);
      const shine=new THREE.Mesh(new THREE.PlaneGeometry(.035,1.72),new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.52,depthWrite:false,toneMapped:false}));shine.position.set(-.13,1.22,.215);shine.renderOrder=12;tube.add(shine);
      const strip=new THREE.Group(),stripMat=new THREE.MeshPhysicalMaterial({color:data.metalColor,roughness:data.silver?.31:.42,metalness:.72,clearcoat:.22}),stripBody=new THREE.Mesh(new THREE.BoxGeometry(.17,1.18,.055),stripMat);strip.add(stripBody);const brushed=new THREE.Mesh(new THREE.PlaneGeometry(.105,1.02),new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.13,depthWrite:false,toneMapped:false}));brushed.position.set(-.027,0,.03);strip.add(brushed);strip.position.set(0,2.72,.03);tube.add(strip);
      const depositMat=new THREE.MeshPhysicalMaterial({color:data.deposit,roughness:data.silver?.22:.58,metalness:data.silver?.91:.54,clearcoat:data.silver?.55:.16}),coat=new THREE.Mesh(new THREE.BoxGeometry(.205,1.01,.074),depositMat);coat.position.y=-.07;coat.scale.y=.001;coat.visible=false;strip.add(coat);const nodules=[];for(let n=0;n<30;n++){const angle=n*2.399,crystal=data.silver?new THREE.Mesh(new THREE.OctahedronGeometry(.032+(n%4)*.008,0),depositMat.clone()):new THREE.Mesh(new THREE.DodecahedronGeometry(.025+(n%3)*.007,0),depositMat.clone());crystal.position.set((n%2?1:-1)*(.092+(n%3)*.008),-.48+(n%10)*.095,(n%2?1:-1)*.036);crystal.rotation.set(angle*.31,angle*.6,angle);crystal.scale.setScalar(.001);strip.add(crystal);nodules.push({mesh:crystal,threshold:.04+(n/29)*.76})}
      const settled=[];for(let n=0;n<22;n++){const flake=data.silver?new THREE.Mesh(new THREE.OctahedronGeometry(.025+(n%3)*.008,0),depositMat.clone()):new THREE.Mesh(new THREE.DodecahedronGeometry(.021+(n%4)*.006,0),depositMat.clone()),a=n*2.399,r=.035+(n%7)*.022;flake.position.set(Math.cos(a)*r,.22+(n%3)*.012,Math.sin(a)*r);flake.rotation.set(a,.7*a,.35*a);flake.scale.setScalar(.001);tube.add(flake);settled.push({mesh:flake,threshold:.22+(n/21)*.68})}
      const swirlMat=new THREE.MeshBasicMaterial({color:data.end,transparent:true,opacity:0,depthWrite:false,toneMapped:false}),swirl=new THREE.Mesh(new THREE.TorusGeometry(.13,.016,10,48),swirlMat);swirl.rotation.x=Math.PI/2;swirl.position.y=.72;swirl.scale.z=.72;tube.add(swirl);tube.position.set(x,0,.14);g.add(tube);this.dynamic.push({kind:'displacementTube',index:i,strip,coat,nodules,settled,swirl,swirlMat,liquidMat,meniscusMat,startColor:new THREE.Color(data.start),endColor:new THREE.Color(data.end),rate:data.rate,silver:!!data.silver});
    });
    g.userData.displacementRig=true;g.userData.testTubes=4;return shadowReady(g)
  }
  thermiteRig(state){
    const g=new THREE.Group(),steel=metal(0x9aa7aa,.28),darkSteel=metal(0x536168,.42),sandMat=new THREE.MeshStandardMaterial({color:0xc6a66d,roughness:.96,metalness:0}),ceramic=new THREE.MeshStandardMaterial({color:0x5a5550,roughness:.88,metalness:.03}),chargeMat=new THREE.MeshStandardMaterial({color:0x6f2d1d,roughness:.92,metalness:.04}),glass=new THREE.MeshPhysicalMaterial({color:0xcceeff,transparent:true,opacity:.24,transmission:.72,roughness:.055,metalness:0,ior:1.46,thickness:.12,clearcoat:.72,clearcoatRoughness:.06,side:THREE.DoubleSide,depthWrite:false}),frame=metal(0x89999e,.2);
    const panel=(geometry,position)=>{const mesh=new THREE.Mesh(geometry,glass);mesh.position.copy(position);mesh.renderOrder=8;mesh.castShadow=false;g.add(mesh);return mesh};
    panel(new THREE.BoxGeometry(5.8,3.65,.045),new THREE.Vector3(0,1.86,-1.62));
    panel(new THREE.BoxGeometry(.045,3.65,2.45),new THREE.Vector3(-2.88,1.86,-.42));

    const rightDoor=new THREE.Group();rightDoor.position.set(2.88,0,-1.62);
    const rightGlass=new THREE.Mesh(new THREE.BoxGeometry(.045,3.65,2.44),glass);rightGlass.position.set(0,1.86,1.22);rightGlass.renderOrder=8;rightGlass.castShadow=false;rightDoor.add(rightGlass);
    const rightTopBar=this.tubeBetween(new THREE.Vector3(0,3.7,0),new THREE.Vector3(0,3.7,2.44),.035,frame);
    const rightBottomBar=this.tubeBetween(new THREE.Vector3(0,.04,0),new THREE.Vector3(0,.04,2.44),.035,frame);
    const rightFrontBar=this.tubeBetween(new THREE.Vector3(0,.04,2.44),new THREE.Vector3(0,3.7,2.44),.035,frame);
    rightDoor.add(rightTopBar,rightBottomBar,rightFrontBar);
    g.add(rightDoor);

    const bars=[
      [new THREE.Vector3(-2.88,.04,-1.62),new THREE.Vector3(-2.88,3.7,-1.62)],[new THREE.Vector3(2.88,.04,-1.62),new THREE.Vector3(2.88,3.7,-1.62)],
      [new THREE.Vector3(-2.88,3.7,-1.62),new THREE.Vector3(2.88,3.7,-1.62)],[new THREE.Vector3(-2.88,.04,-1.62),new THREE.Vector3(2.88,.04,-1.62)],
      [new THREE.Vector3(-2.88,.04,.82),new THREE.Vector3(-2.88,3.7,.82)],
      [new THREE.Vector3(-2.88,3.7,-1.62),new THREE.Vector3(-2.88,3.7,.82)],[new THREE.Vector3(-2.88,.04,-1.62),new THREE.Vector3(-2.88,.04,.82)]
    ];
    for(const [a,b] of bars){const rail=this.tubeBetween(a,b,.035,frame);rail.castShadow=true;g.add(rail)}
    const hingeMat=metal(0x455257,.3);for(const y of [.35,1.85,3.35]){const hinge=cylinder(.052,.12,hingeMat);hinge.position.set(2.88,y,-1.62);g.add(hinge)}
    const shieldGlowMat=new THREE.MeshBasicMaterial({color:0xff8a30,transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false,side:THREE.DoubleSide}),shieldGlow=new THREE.Mesh(new THREE.PlaneGeometry(5.55,3.4),shieldGlowMat);shieldGlow.position.set(0,1.86,-1.59);shieldGlow.renderOrder=7;g.add(shieldGlow);

    const canWall=new THREE.Mesh(new THREE.CylinderGeometry(1.34,1.3,1.22,72,1,true),new THREE.MeshPhysicalMaterial({color:0x9da9ab,metalness:.73,roughness:.38,clearcoat:.2,side:THREE.DoubleSide}));canWall.position.y=.61;g.add(canWall);
    const canBottom=cylinder(1.31,.08,darkSteel,72);canBottom.position.y=.04;g.add(canBottom);
    for(let i=0;i<8;i++){const band=new THREE.Mesh(new THREE.TorusGeometry(1.325,.028,10,72),steel);band.rotation.x=Math.PI/2;band.position.y=.13+i*.145;g.add(band)}
    const rolledRim=new THREE.Mesh(new THREE.TorusGeometry(1.35,.055,16,88),steel);rolledRim.rotation.x=Math.PI/2;rolledRim.position.y=1.22;g.add(rolledRim);
    const sandBody=cylinder(1.265,1.06,sandMat,72);sandBody.position.y=.57;g.add(sandBody);const sandTop=cylinder(1.265,.055,new THREE.MeshStandardMaterial({color:0xd4b779,roughness:1}),72);sandTop.position.y=1.105;g.add(sandTop);
    for(let i=0;i<58;i++){const angle=i*2.399,r=.55+((i*37)%100)/100*.63,grain=new THREE.Mesh(new THREE.DodecahedronGeometry(.025+(i%4)*.009,0),sandMat);grain.position.set(Math.cos(angle)*r,1.13+((i*29)%7)*.007,Math.sin(angle)*r);grain.rotation.set(i*.57,i*1.13,i*.31);grain.scale.set(1.4,.5+.12*(i%3),1);g.add(grain)}

    const cupProfile=[[0,0],[.38,.02],[.46,.16],[.5,.62],[.55,.72],[.51,.78]].map(([x,y])=>new THREE.Vector2(x,y)),cup=new THREE.Mesh(new THREE.LatheGeometry(cupProfile,64),ceramic);cup.position.y=.72;g.add(cup);const cupRim=new THREE.Mesh(new THREE.TorusGeometry(.535,.05,14,72),ceramic);cupRim.rotation.x=Math.PI/2;cupRim.position.y=1.48;g.add(cupRim);const charge=cylinder(.47,.055,chargeMat,64);charge.position.y=1.455;g.add(charge);
    const ironBlobGeometry=new THREE.SphereGeometry(.49,72,42),ironPositions=ironBlobGeometry.attributes.position;for(let i=0;i<ironPositions.count;i++){const x=ironPositions.getX(i),y=ironPositions.getY(i),z=ironPositions.getZ(i),irregular=1+.075*Math.sin(x*15+z*9)+.045*Math.sin(z*19-y*13)+.025*Math.cos(x*27+y*11);ironPositions.setXYZ(i,x*irregular*(1+.035*Math.sin(y*18)),y*(.94+.055*Math.sin(x*17-z*12)),z*irregular*(1+.04*Math.cos(y*15)))}ironPositions.needsUpdate=true;ironBlobGeometry.computeVertexNormals();const ironBlobMat=new THREE.MeshPhysicalMaterial({color:0xff6f19,emissive:0xff2400,emissiveIntensity:2.4,metalness:.82,roughness:.2,clearcoat:.58,clearcoatRoughness:.16}),ironBlob=new THREE.Mesh(ironBlobGeometry,ironBlobMat);ironBlob.position.set(0,1.565,.005);ironBlob.rotation.set(.03,-.24,.025);ironBlob.visible=false;g.add(ironBlob);const ironGlowLight=new THREE.PointLight(0xff5b24,0,2.5,1.8);ironGlowLight.position.set(0,1.73,.08);g.add(ironGlowLight);

    const fuseCurve=new THREE.CatmullRomCurve3([new THREE.Vector3(.02,1.49,.02),new THREE.Vector3(.32,1.63,.1),new THREE.Vector3(.78,1.76,.16),new THREE.Vector3(1.34,1.82,.22)],false,'centripetal'),fuseSegments=[],fuseSegmentCount=34;
    for(let i=0;i<fuseSegmentCount;i++){const start=i/fuseSegmentCount,end=(i+1)/fuseSegmentCount,segmentCurve=new THREE.LineCurve3(fuseCurve.getPoint(start),fuseCurve.getPoint(end)),segmentMat=new THREE.MeshPhysicalMaterial({color:0xe4ecec,metalness:.78,roughness:.18,clearcoat:.55,emissive:0x191919,emissiveIntensity:0}),segment=new THREE.Mesh(new THREE.TubeGeometry(segmentCurve,3,.028,12,false),segmentMat);segment.userData.mid=(start+end)/2;g.add(segment);fuseSegments.push(segment)}
    const mgoGeometry=new THREE.DodecahedronGeometry(.028,0),mgoMaterial=new THREE.MeshStandardMaterial({color:0xf8f8ef,roughness:.98,metalness:0,emissive:0x76766f,emissiveIntensity:.18}),mgoPowder=[];
    for(let i=0;i<88;i++){const u=.035+((i*37)%89)/89*.94,grain=new THREE.Mesh(mgoGeometry,mgoMaterial),angle=i*2.399,scale=.62+(i%5)*.16;grain.visible=false;grain.scale.setScalar(scale);g.add(grain);mgoPowder.push({mesh:grain,u,angle,spread:.035+(i%7)*.012,fall:.7+((i*29)%13)/13*.3,scale})}
    const mgoPuffMat=new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:0,depthWrite:false,toneMapped:false}),mgoPuffs=[];for(let i=0;i<14;i++){const puff=new THREE.Mesh(new THREE.SphereGeometry(.035+(i%4)*.012,14,9),mgoPuffMat.clone());puff.visible=false;puff.renderOrder=19;g.add(puff);mgoPuffs.push(puff)}
    const emberMat=new THREE.MeshBasicMaterial({color:0xfff0a3,transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false}),fuseEmber=new THREE.Mesh(new THREE.SphereGeometry(.075,24,16),emberMat);fuseEmber.visible=false;g.add(fuseEmber);const fuseLight=new THREE.PointLight(0xff8a3a,0,2.2,1.8);g.add(fuseLight);const fuseSparks=[];for(let i=0;i<16;i++){const spark=new THREE.Mesh(new THREE.SphereGeometry(.012+(i%3)*.004,10,7),new THREE.MeshBasicMaterial({color:i%3===0?0xffffff:0xffad42,transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false}));spark.visible=false;g.add(spark);fuseSparks.push(spark)}

    const torch=new THREE.Group(),torchRed=new THREE.MeshStandardMaterial({color:0xb93b30,roughness:.34,metalness:.22}),torchDark=solid(0x242c2f,.5),brass=metal(0xc89b38,.2),body=cylinder(.18,.82,torchRed,36);body.rotation.z=Math.PI/2;body.position.x=.28;torch.add(body);const rear=cylinder(.19,.08,torchDark,32);rear.rotation.z=Math.PI/2;rear.position.x=.72;torch.add(rear);const handle=new THREE.Mesh(new THREE.BoxGeometry(.22,.64,.24),torchDark);handle.position.set(.35,-.38,0);handle.rotation.z=-.12;torch.add(handle);const collar=cylinder(.13,.25,brass,32);collar.rotation.z=Math.PI/2;collar.position.x=-.25;torch.add(collar);const nozzle=cylinder(.072,.62,brass,28);nozzle.rotation.z=Math.PI/2;nozzle.position.x=-.68;torch.add(nozzle);const valve=cylinder(.11,.08,torchDark,24);valve.position.set(-.16,.24,0);torch.add(valve);
    const outerFlame=new THREE.Mesh(new THREE.ConeGeometry(.115,.58,32),new THREE.MeshBasicMaterial({color:0x44b9ff,transparent:true,opacity:.68,blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false}));outerFlame.rotation.z=Math.PI/2;outerFlame.position.x=-1.23;torch.add(outerFlame);const innerFlame=new THREE.Mesh(new THREE.ConeGeometry(.06,.39,28),new THREE.MeshBasicMaterial({color:0xdaf8ff,transparent:true,opacity:.88,blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false}));innerFlame.rotation.z=Math.PI/2;innerFlame.position.x=-1.14;torch.add(innerFlame);const torchLight=new THREE.PointLight(0x58c8ff,1.7,1.8,1.7);torchLight.position.x=-1.33;torch.add(torchLight);const torchStart=new THREE.Vector3(4.0,1.92,.58),torchTarget=new THREE.Vector3(2.54,1.9,.36);torch.position.copy(torchStart);g.add(torch);

    const additive=color=>new THREE.MeshBasicMaterial({color,transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false}),flashCore=new THREE.Mesh(new THREE.SphereGeometry(.55,40,24),additive(0xffffff));flashCore.position.set(0,1.62,0);flashCore.visible=false;g.add(flashCore);const corona=new THREE.Mesh(new THREE.SphereGeometry(.82,40,24),additive(0xff8a24));corona.position.copy(flashCore.position);corona.visible=false;g.add(corona);const fireColumn=new THREE.Mesh(new THREE.ConeGeometry(.58,2.7,48),additive(0xffb22e));fireColumn.position.set(0,2.65,0);fireColumn.visible=false;g.add(fireColumn);const flashLight=new THREE.PointLight(0xffa43b,0,8,1.25);flashLight.position.set(0,2.2,.2);g.add(flashLight);
    const shockwaves=[];for(let i=0;i<2;i++){const wave=new THREE.Mesh(new THREE.TorusGeometry(.26,.028,10,64),additive(i?0xff9e54:0xffffff));wave.rotation.x=Math.PI/2;wave.position.set(0,1.55,0);wave.visible=false;g.add(wave);shockwaves.push(wave)}

    const sparkCount=190,sparkGeometry=new THREE.CylinderGeometry(.025,.047,.36,6),sparkMaterial=new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.96,blending:THREE.AdditiveBlending,depthWrite:false,depthTest:false,toneMapped:false,vertexColors:true}),sparkMesh=new THREE.InstancedMesh(sparkGeometry,sparkMaterial,sparkCount),sparkData=[],dummy=new THREE.Object3D();sparkMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);sparkMesh.frustumCulled=false;sparkMesh.renderOrder=28;sparkMesh.visible=false;g.add(sparkMesh);for(let i=0;i<sparkCount;i++){const f=(i*37%191)/190,s=(i*73%193)/192;sparkData.push({angle:i*2.399+(i%7)*.17,speed:.72+f*1.3,vy:1.8+s*2.55,life:.68+(i%9)*.075,delay:(i%31)*.055,spin:i*.77,heavy:i%7===0});sparkMesh.setColorAt(i,new THREE.Color(i%11===0?0xffffff:i%4===0?0xffe9a6:i%3===0?0xff8a23:0xffbd48))}sparkMesh.instanceColor.needsUpdate=true;
    const nearSparkGeometry=new THREE.CylinderGeometry(.021,.038,.28,6),nearSparkMats=[0xffffff,0xffe2a0,0xffa326].map(color=>new THREE.MeshBasicMaterial({color,transparent:true,opacity:.98,blending:THREE.AdditiveBlending,depthWrite:false,depthTest:false,toneMapped:false})),nearSparks=[];for(let i=0;i<48;i++){const trail=new THREE.Mesh(nearSparkGeometry,nearSparkMats[i%nearSparkMats.length]);trail.renderOrder=30;trail.visible=false;g.add(trail);nearSparks.push(trail)}
    const smoke=[];for(let i=0;i<22;i++){const puff=new THREE.Mesh(new THREE.SphereGeometry(.18+(i%5)*.045,20,14),new THREE.MeshStandardMaterial({color:i%3===0?0x5b5550:0x77716d,transparent:true,opacity:0,roughness:1,depthWrite:false}));puff.visible=false;g.add(puff);smoke.push({mesh:puff,angle:i*2.399,delay:(i%8)*.17,speed:.3+(i%5)*.04,drift:.12+(i%4)*.05})}
    const sandDust=[];for(let i=0;i<34;i++){const mote=new THREE.Mesh(new THREE.DodecahedronGeometry(.018+(i%3)*.007,0),new THREE.MeshBasicMaterial({color:0xd9bb7c,transparent:true,opacity:0,depthWrite:false}));mote.visible=false;g.add(mote);sandDust.push({mesh:mote,angle:i*2.399,speed:.18+(i%6)*.05,delay:(i%9)*.04})}
    this.dynamic.push({kind:'thermite',torch,outerFlame,innerFlame,torchLight,torchStart,torchTarget,fuseCurve,fuseSegments,fuseEmber,fuseLight,fuseSparks,mgoPowder,mgoPuffs,flashCore,corona,fireColumn,flashLight,shockwaves,sparkMesh,sparkData,nearSparks,dummy,ironBlob,ironGlowLight,smoke,sandDust,shieldGlow,rightDoor,afterglowStart:0});
    g.userData.thermiteRig=true;g.userData.containment='U-shaped heat-resistant glass shield and sand-filled corrugated metal can';return shadowReady(g)
  }
  liquidPourStream(a,b,{color=0xa9eeff,time=0,radius=.045,opacity=.74,sag=.055,breakup=.7,droplets=5,splash=true}={}){
    const g=new THREE.Group(),clamp=v=>Math.max(0,Math.min(1,v)),continuousEnd=clamp(breakup+.022*Math.sin(time*9.7)),pointAt=q=>{
      const p=new THREE.Vector3().lerpVectors(a,b,q),arc=Math.sin(Math.PI*q);
      p.y-=sag*arc*(.35+.65*q);p.x+=Math.sin(q*10.4-time*5.2)*radius*.13*arc;p.z+=Math.sin(q*13.7+time*4.1)*radius*.18*arc;return p
    };
    const rings=24,sides=12,positions=[],indices=[];
    for(let i=0;i<=rings;i++){
      const q=continuousEnd*i/rings,p=pointAt(q),ahead=pointAt(Math.min(1,q+.008)),behind=pointAt(Math.max(0,q-.008)),tangent=ahead.sub(behind).normalize(),reference=Math.abs(tangent.z)<.92?new THREE.Vector3(0,0,1):new THREE.Vector3(1,0,0),side=new THREE.Vector3().crossVectors(tangent,reference).normalize(),normal=new THREE.Vector3().crossVectors(side,tangent).normalize(),neck=1-.42*(q/Math.max(.001,continuousEnd)),pulse=1+.105*Math.sin(time*13.6-q*19.2)+.045*Math.sin(time*29+q*11),r=Math.max(radius*.34,radius*neck*pulse);
      for(let j=0;j<sides;j++){const angle=j/sides*Math.PI*2,offset=side.clone().multiplyScalar(Math.cos(angle)*r).add(normal.clone().multiplyScalar(Math.sin(angle)*r));positions.push(p.x+offset.x,p.y+offset.y,p.z+offset.z)}
    }
    for(let i=0;i<rings;i++)for(let j=0;j<sides;j++){const n=j===sides-1?0:j+1,a0=i*sides+j,a1=i*sides+n,b0=(i+1)*sides+j,b1=(i+1)*sides+n;indices.push(a0,b0,a1,a1,b0,b1)}
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();
    const liquidMat=new THREE.MeshPhysicalMaterial({color,transparent:true,opacity:Math.min(.92,opacity+.1),roughness:.065,transmission:.1,ior:1.333,thickness:.12,clearcoat:1,clearcoatRoughness:.035,side:THREE.DoubleSide,depthWrite:false,emissive:color,emissiveIntensity:.1}),stream=new THREE.Mesh(geometry,liquidMat);stream.renderOrder=14;stream.castShadow=false;stream.receiveShadow=false;g.add(stream);
    const highlightPoints=[];for(let i=0;i<=18;i++){const p=pointAt(continuousEnd*i/18);p.z+=radius*.58;highlightPoints.push(p)}const highlightGeometry=new THREE.BufferGeometry().setFromPoints(highlightPoints),highlight=new THREE.Line(highlightGeometry,new THREE.LineBasicMaterial({color:0xf3fdff,transparent:true,opacity:.42,depthWrite:false,toneMapped:false}));highlight.renderOrder=15;g.add(highlight);
    const dropMat=liquidMat.clone();dropMat.opacity=Math.min(.94,opacity+.16);for(let i=0;i<droplets;i++){const phase=(time*1.72+i/droplets)%1,q=continuousEnd+(1-continuousEnd)*phase,p=pointAt(q),ahead=pointAt(Math.min(1,q+.012)),behind=pointAt(Math.max(0,q-.012)),tangent=ahead.sub(behind).normalize(),drop=new THREE.Mesh(new THREE.SphereGeometry(radius*(.67-.15*phase),18,12),dropMat);drop.position.copy(p);drop.scale.set(.82,1.42+phase*.78,.82);drop.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),tangent);drop.renderOrder=16;drop.castShadow=false;g.add(drop)}
    if(splash){const splashQ=(time*2.18)%1,ringMat=new THREE.MeshBasicMaterial({color:0xe7fbff,transparent:true,opacity:(1-splashQ)*.55,depthWrite:false,toneMapped:false}),ring=new THREE.Mesh(new THREE.TorusGeometry(radius*1.45,.007,8,36),ringMat);ring.rotation.x=Math.PI/2;ring.position.copy(b);ring.position.y+=.008;ring.scale.setScalar(.65+splashQ*1.65);ring.renderOrder=16;g.add(ring);const splashMat=new THREE.MeshBasicMaterial({color:0xeafcff,transparent:true,opacity:Math.sin(Math.PI*splashQ)*.8,depthWrite:false,toneMapped:false});for(let i=0;i<4;i++){const angle=i*Math.PI/2+.35,r=.015+splashQ*radius*(1.55+(i%2)*.4),drop=new THREE.Mesh(new THREE.SphereGeometry(radius*.22,12,8),splashMat);drop.position.set(b.x+Math.cos(angle)*r,b.y+.012+Math.sin(Math.PI*splashQ)*radius*(.9+(i%3)*.25),b.z+Math.sin(angle)*r*.65);drop.renderOrder=17;g.add(drop)}}
    g.userData.pourVisual='tapered translucent stream with necking, droplet breakup and surface splash';return g
  }
  granularPour(a,b,time=0,{color=0x17191a,count=28}={}){const g=new THREE.Group(),mat=new THREE.MeshStandardMaterial({color,roughness:.86,metalness:0});for(let i=0;i<count;i++){const q=(time*.78+i/count)%1,angle=i*2.399,jitter=.018+(i%5)*.008,p=new THREE.Vector3().lerpVectors(a,b,q);p.y-=Math.sin(Math.PI*q)*.045;p.x+=Math.cos(angle)*jitter;p.z+=Math.sin(angle)*jitter;const grain=new THREE.Mesh(new THREE.DodecahedronGeometry(.012+(i%4)*.004,0),mat);grain.position.copy(p);grain.rotation.set(i*.71+time,i*1.13-time*.4,i*.47);grain.scale.set(1,.65+(i%3)*.16,1);g.add(grain)}g.userData.pourVisual='individual falling powder grains';return g}
  anchorPouringLip(source,receiver,{sourceLip=new THREE.Vector3(0,1.95,0),receiverOpening=new THREE.Vector3(0,1.72,0),clearance=.4,weight=1}={}){
    this.root.updateMatrixWorld(true);
    const opening=receiver.localToWorld(receiverOpening.clone()),mouth=source.localToWorld(sourceLip.clone()),desired=opening.clone();desired.y+=clearance;
    const correction=desired.sub(mouth).multiplyScalar(Math.max(0,Math.min(1,weight)));source.position.add(correction);
    this.root.updateMatrixWorld(true);
    const alignedMouth=source.localToWorld(sourceLip.clone()),alignedOpening=receiver.localToWorld(receiverOpening.clone());this.pourAlignment={mouth:alignedMouth.clone(),opening:alignedOpening.clone(),horizontalError:Math.hypot(alignedMouth.x-alignedOpening.x,alignedMouth.z-alignedOpening.z),verticalClearance:alignedMouth.y-alignedOpening.y};
    return {mouth:alignedMouth,opening:alignedOpening}
  }
  tubeBetween(a,b,r=.045,mat=solid(0x83989f,.5)){const d=b.clone().sub(a),m=a.clone().add(b).multiplyScalar(.5);const mesh=cylinder(r,d.length(),mat,18);mesh.position.copy(m);mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.clone().normalize());return mesh}
  delivery(a,b){const curve=new THREE.CatmullRomCurve3([a,new THREE.Vector3((a.x+b.x)*.5,2.8,a.z-.1),new THREE.Vector3(b.x-.35,2.25,b.z),b]);return new THREE.Mesh(new THREE.TubeGeometry(curve,40,.055,12,false),solid(0x71878e,.42))}
  bubbleCloud(count=14,radius=.4,height=.8,color=0xe8fbff){const g=new THREE.Group();for(let i=0;i<count;i++){const mat=new THREE.MeshPhysicalMaterial({color,transparent:true,opacity:.48,roughness:.08,transmission:.4,depthWrite:false});const bubble=new THREE.Mesh(new THREE.SphereGeometry(.022+(i%3)*.01,14,10),mat);const angle=i*2.399;const spread=radius*(.22+(i%5)/6);bubble.position.set(Math.cos(angle)*spread,.12+((i*.173)%1)*height,Math.sin(angle)*spread);bubble.userData.baseY=.1;g.add(bubble);this.dynamic.push({kind:'bubble',mesh:bubble,height,speed:.22+(i%5)*.055,phase:(i*.173)%1})}return g}
  oneHoleBung(tubeBottom=1.64,tubeTop=2.2){
    const g=new THREE.Group(),rubber=new THREE.MeshStandardMaterial({color:0x293338,roughness:.92,metalness:.01}),edge=new THREE.MeshStandardMaterial({color:0x10181b,roughness:.8}),tubeMat=new THREE.MeshPhysicalMaterial({color:0xb8e5ee,transparent:true,opacity:.72,transmission:.34,roughness:.09,ior:1.45,thickness:.055,side:THREE.DoubleSide,depthWrite:false});
    const stopper=new THREE.Mesh(new THREE.CylinderGeometry(.205,.235,.25,64),rubber);stopper.position.y=1.87;g.add(stopper);
    const topRing=new THREE.Mesh(new THREE.TorusGeometry(.066,.019,12,40),edge);topRing.rotation.x=Math.PI/2;topRing.position.y=2.003;g.add(topRing);
    const stem=this.tubeBetween(new THREE.Vector3(0,tubeBottom,0),new THREE.Vector3(0,tubeTop,0),.047,tubeMat);stem.renderOrder=6;g.add(stem);
    const bore=this.tubeBetween(new THREE.Vector3(0,tubeBottom+.012,0),new THREE.Vector3(0,tubeTop-.012,0),.017,new THREE.MeshBasicMaterial({color:0x607e86,transparent:true,opacity:.32,depthWrite:false}));bore.renderOrder=7;g.add(bore);
    g.userData={oneHoleBung:true,tubeBottom,tubeTop};return shadowReady(g)
  }
  co2DeliveryTube(a,b){
    const rubber=new THREE.MeshStandardMaterial({color:0x526b73,roughness:.67,metalness:.02}),curve=new THREE.CatmullRomCurve3([a,new THREE.Vector3(a.x+.34,2.55,a.z),new THREE.Vector3(-.48,2.88,a.z-.06),new THREE.Vector3(.58,2.83,b.z-.06),new THREE.Vector3(b.x-.34,2.55,b.z),b],false,'centripetal'),hose=new THREE.Mesh(new THREE.TubeGeometry(curve,72,.068,16,false),rubber);
    hose.castShadow=true;hose.receiveShadow=true;
    const connectorMat=metal(0x9aaeb4,.22),assembly=new THREE.Group();assembly.add(hose);
    for(const point of [a,b]){const collar=new THREE.Mesh(new THREE.TorusGeometry(.073,.012,10,36),connectorMat);collar.rotation.x=Math.PI/2;collar.position.copy(point);assembly.add(collar)}
    return shadowReady(assembly)
  }
  co2TurbidityCloud(q){
    const g=new THREE.Group(),opacity=Math.max(0,Math.min(1,q));
    for(let i=0;i<48;i++){const angle=i*2.399,r=.05+(i%8)*.066,y=.105+((i*.217)%1)*.44,mat=new THREE.MeshPhysicalMaterial({color:i%5===0?0xf5f3e8:0xe2e4dc,transparent:true,opacity:opacity*(.1+(i%4)*.045),roughness:.9,depthWrite:false}),flake=new THREE.Mesh(new THREE.DodecahedronGeometry(.012+(i%3)*.006,0),mat);flake.position.set(Math.cos(angle)*r,y,Math.sin(angle)*r);flake.rotation.set(angle*.3,angle*.7,angle);g.add(flake)}
    return g
  }
  co2BubblePlume(){
    const g=new THREE.Group();
    for(let i=0;i<24;i++){const radius=.028+(i%4)*.008,mat=new THREE.MeshBasicMaterial({color:i%4===0?0xcaf3f8:0xf7ffff,transparent:true,opacity:0,depthWrite:false,depthTest:false,side:THREE.DoubleSide}),bubble=new THREE.Mesh(new THREE.TorusGeometry(radius,.0065,8,24),mat);bubble.renderOrder=12;g.add(bubble);this.dynamic.push({kind:'co2Bubble',mesh:bubble,phase:(i*.127)%1,speed:.31+(i%5)*.045,angle:i*2.399,startY:.17,surfaceY:.57})}
    return g
  }
  reactionEffects(group,reaction){const glowMat=new THREE.MeshBasicMaterial({color:reaction.kind==='neutralisation'?0xffd27b:reaction.productColor||0x9fe7ef,transparent:true,opacity:.1,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false}),glow=new THREE.Mesh(new THREE.SphereGeometry(.48,32,20),glowMat);glow.position.set(0,.52,.02);group.add(glow);const precip=new THREE.Group();for(let i=0;i<18;i++){const mat=new THREE.MeshPhysicalMaterial({color:reaction.productColor||0xe8e6d9,transparent:true,opacity:0,roughness:.7,metalness:.04,depthWrite:false});const flake=new THREE.Mesh(new THREE.DodecahedronGeometry(.025+(i%4)*.008,0),mat),a=i*2.399,r=.08+(i%6)*.06;flake.position.set(Math.cos(a)*r,.12+(i%5)*.045,Math.sin(a)*r);flake.scale.set(1.5,.55,.9);precip.add(flake)}group.add(precip);const bubbles=[];for(let i=0;i<12;i++){const bubble=new THREE.Mesh(new THREE.SphereGeometry(.024+(i%3)*.008,14,10),new THREE.MeshBasicMaterial({color:0xf2fdff,transparent:true,opacity:0,depthWrite:false,toneMapped:false}));bubble.userData={phase:(i*.173)%1,angle:i*2.399};group.add(bubble);bubbles.push(bubble)}this.dynamic.push({kind:'freeReaction',reaction,glow,precip,bubbles,seed:reaction.ruleId.length*.73})}
  chromatographyPaper(){
    const g=new THREE.Group(),sheet=new THREE.Mesh(new THREE.PlaneGeometry(1.28,2.12),new THREE.MeshStandardMaterial({color:0xfffdf2,roughness:.88,metalness:0,side:THREE.DoubleSide}));
    sheet.receiveShadow=true;g.add(sheet);
    const pencilMat=new THREE.MeshBasicMaterial({color:0x6f7b7f,transparent:true,opacity:.72,depthWrite:false,depthTest:false});
    const baseline=new THREE.Mesh(new THREE.PlaneGeometry(1.06,.018),pencilMat);baseline.position.set(0,-.66,.014);baseline.renderOrder=4;g.add(baseline);
    const wet=new THREE.Mesh(new THREE.PlaneGeometry(1.1,1),new THREE.MeshBasicMaterial({color:0x9fd8e6,transparent:true,opacity:.32,depthWrite:false,depthTest:false}));wet.position.z=.024;wet.renderOrder=3;g.add(wet);
    const front=new THREE.Mesh(new THREE.PlaneGeometry(1.08,.022),new THREE.MeshBasicMaterial({color:0x737b7b,transparent:true,opacity:0,depthWrite:false,depthTest:false}));front.position.set(0,-.66,.031);front.renderOrder=5;g.add(front);this.dynamic.push({kind:'chromatographySolvent',wet,front});
    const ink=new THREE.Mesh(new THREE.CircleGeometry(.073,32),new THREE.MeshBasicMaterial({color:0x1b2022,transparent:true,opacity:.96,depthWrite:false,depthTest:false}));ink.position.set(0,-.63,.024);ink.renderOrder=8;g.add(ink);this.dynamic.push({kind:'chromatographyInk',mesh:ink});
    const dyeMat=color=>new THREE.MeshBasicMaterial({color,transparent:true,opacity:0,depthWrite:false,depthTest:false});
    const dyes=[{x:-.39,color:0xe23d79,end:.61},{x:-.13,color:0x2879d8,end:.75},{x:.13,color:0xf0bd2e,end:.31},{x:.39,color:0x36a568,end:.5}];
    for(const [i,d] of dyes.entries()){const spot=new THREE.Mesh(new THREE.CircleGeometry(.061,32),dyeMat(d.color));spot.position.set(0,-.63,.024);spot.renderOrder=7;g.add(spot);const tail=new THREE.Mesh(new THREE.CircleGeometry(.052,28),new THREE.MeshBasicMaterial({color:d.color,transparent:true,opacity:0,depthWrite:false,depthTest:false}));tail.position.set(0,-.63,.021);tail.renderOrder=6;g.add(tail);this.dynamic.push({kind:'chromatographyDye',mesh:spot,tail,x:d.x,startY:-.63,endY:d.end,phase:i*.9})}
    return shadowReady(g)
  }
  add(obj,x,z=0,y=0,scale=1){obj.position.set(x,y,z);obj.scale.multiplyScalar(scale);this.root.add(obj);return obj}
  itemObject(it,flameHeight=1){const contents=it.contents||[],last=contents.at(-1),level=contents.length?Math.min(.82,.16+contents.reduce((s,c)=>s+c.amount,0)/(last?.unit==='mL'?160:55)):.035,color=it.reaction?.productColor??last?.color??0x47afd1;let vessel;switch(it.type){case'flask':vessel=this.flask(level,color);break;case'beaker':vessel=this.beaker(level,color);if(contents.length&&(it.temperature||20)>=68)vessel.add(this.bubbleCloud(20,.52,Math.max(.3,level*.85),0xe9fbff));break;case'tube':vessel=this.testTube(level,color);break;case'bunsen':return this.bunsen(it.lit,flameHeight,flameHeight<.9);case'tripod':return this.tripod();case'balance':return this.balance(it.mass||0);case'thermometer':return this.thermometer();case'phmeter':return this.meter();default:return new THREE.Group()}if(it.reaction)this.reactionEffects(vessel,it.reaction);return vessel}
  freeBunsenHeight(it,state){if(!it?.lit)return 1;const support=state.workspace.filter(a=>a.type==='tripod').map(tripod=>({tripod,d:Math.hypot(it.x-tripod.x,it.y-tripod.y)})).filter(a=>a.d<115).sort((a,b)=>a.d-b.d)[0]?.tripod;if(!support||!state.workspace.some(a=>(a.type==='beaker'||a.type==='flask')&&a.snappedTo===support.uid))return 1;const itemScale=1.15,beakerBottom=2.1+.04*itemScale,flameBottom=1.29*itemScale,gap=.065,flameSpan=1.42*itemScale;return Math.max(.32,Math.min(.42,(beakerBottom-flameBottom-gap)/flameSpan))}
  evaporatingBasin(crystalsQ=0) {
    const g = new THREE.Group();
    const ceramic = new THREE.MeshPhysicalMaterial({color: 0xfafafa, roughness: 0.6, metalness: 0, clearcoat: 0.1, side: THREE.DoubleSide});
    // A heavier ceramic wall keeps the basin readable against the gauze.  The
    // final shoulder is deliberately rolled over so the separate torus below
    // reads as a soft, rounded pouring lip rather than a sharp rim.
    const profile = [[0,.025], [.32,.025], [.52,.06], [.73,.18], [.88,.36], [.96,.49], [.94,.54]].map(([x,y]) => new THREE.Vector2(x,y));
    const body = new THREE.Mesh(new THREE.LatheGeometry(profile, 64), ceramic);
    body.geometry.computeVertexNormals();
    g.add(body);
    const lip = new THREE.Mesh(new THREE.TorusGeometry(.885, .065, 20, 96), ceramic);
    lip.rotation.x = Math.PI / 2;
    lip.position.y = .535;
    lip.renderOrder = 5;
    g.add(lip);
    const liqMat = new THREE.MeshPhysicalMaterial({color: 0x319bd3, transparent: true, opacity: 0.8, roughness: 0.1, transmission: 0.2, side: THREE.DoubleSide});
    const liqProfile = [[0,0], [.3,0], [.5,.035], [.7,.15], [.84,.32], [0,.32]].map(([x,y]) => new THREE.Vector2(x,y));
    const liquid = new THREE.Mesh(new THREE.LatheGeometry(liqProfile, 64), liqMat);
    liquid.geometry.computeVertexNormals();
    liquid.position.y = 0.022;
    liquid.scale.set(0.98, 0.98, 0.98);
    g.add(liquid);
    if(crystalsQ > 0){
       const crMat = solid(0x2774d6, 0.9);
       const clusters = [
          {cx: 0.15, cz: 0.1}, {cx: -0.25, cz: 0.3},
          {cx: 0.3, cz: -0.2}, {cx: -0.4, cz: -0.25},
          {cx: 0.0, cz: -0.45}, {cx: 0.45, cz: 0.25}
       ];
       for(let i=0; i<45; i++){
          const cluster = clusters[i % clusters.length];
          const angle = i * 2.399;
          const dist = ((i * 17) % 100) / 100 * 0.28;
          let x = cluster.cx + Math.cos(angle) * dist;
          let z = cluster.cz + Math.sin(angle) * dist;
          
          let r = Math.hypot(x, z);
          if (r > 0.8) {
             x = (x / r) * 0.8;
             z = (z / r) * 0.8;
             r = 0.8;
          }
          
          let baseY = 0.02;
          if (r > 0.3 && r <= 0.5) baseY = 0.02 + (r - 0.3) / 0.2 * 0.03;
          else if (r > 0.5 && r <= 0.7) baseY = 0.05 + (r - 0.5) / 0.2 * 0.10;
          else if (r > 0.7) baseY = 0.15 + (r - 0.7) / 0.15 * 0.17;
          
          const cr = new THREE.Mesh(new THREE.DodecahedronGeometry(0.04+0.02*(i%3), 0), crMat);
          cr.position.set(x, baseY + 0.015 + ((i * 23) % 100) / 100 * 0.04, z);
          cr.rotation.set(i*1.1, i*0.7, i*2.2);
          cr.scale.set(
             crystalsQ * (0.6 + ((i * 31) % 100)/100 * 0.8),
             crystalsQ * (0.6 + ((i * 47) % 100)/100 * 0.8),
             crystalsQ * (0.6 + ((i * 59) % 100)/100 * 0.8)
          );
          g.add(cr);
       }
       const s = Math.max(0.01, 1 - crystalsQ);
       liquid.scale.set(0.98 * s, 0.98 * s, 0.98 * s);
    }
    return shadowReady(g);
  }
  filterFunnel() {
    const g = new THREE.Group();
    const coneProfile = [[0.06, 0], [0.06, 0.5], [0.45, 0.9], [0.47, 0.92]].map(([x,y]) => new THREE.Vector2(x,y));
    const cone = new THREE.Mesh(new THREE.LatheGeometry(coneProfile, 48), typeof GLASS === 'function' ? GLASS() : new THREE.MeshPhysicalMaterial({color:0xd9f4ff, transparent:true, opacity:0.48, transmission:0.72, roughness:0.025, ior:1.46, thickness:0.11, side:THREE.DoubleSide}));
    cone.geometry.computeVertexNormals();
    g.add(cone);
    const paperMat = new THREE.MeshStandardMaterial({color: 0xffffff, roughness: 0.9, side: THREE.DoubleSide});
    const paperProfile = [[0.08, 0.5], [0.43, 0.9]].map(([x,y]) => new THREE.Vector2(x,y));
    const paper = new THREE.Mesh(new THREE.LatheGeometry(paperProfile, 32), paperMat);
    paper.geometry.computeVertexNormals();
    g.add(paper);
    return shadowReady(g);
  }
  pondweedRig(state) {
    const g = new THREE.Group();
    const dist = state.pondweedDistance || 20;
    const lampOn = state.pondweedLampOn !== false;
    const beakerX = 1.5, beakerZ = -0.6;

    // 1. Detailed 3D Wooden Meter Ruler on top of bench surface (y = 0.1125) extending from beaker base (x = 1.0) leftwards
    const rulerGroup = new THREE.Group();
    const rulerMat = new THREE.MeshStandardMaterial({ color: 0xd4a359, roughness: 0.65 });
    const rulerLen = 3.2;
    const ruler = new THREE.Mesh(new THREE.BoxGeometry(rulerLen, 0.025, 0.28), rulerMat);
    ruler.position.set(-0.25, 0.1125, beakerZ);
    rulerGroup.add(ruler);

    // Dark tick marks along the ruler (0cm to 50cm)
    const tickMat = new THREE.MeshBasicMaterial({ color: 0x221a0f });
    for (let cm = 0; cm <= 50; cm += 2) {
      const isMajor = cm % 10 === 0;
      const tickX = 1.0 - (cm / 50) * 2.5;
      const tick = new THREE.Mesh(
        new THREE.BoxGeometry(0.015, 0.027, isMajor ? 0.22 : 0.12),
        tickMat
      );
      tick.position.set(tickX, 0.126, beakerZ);
      rulerGroup.add(tick);
    }
    g.add(rulerGroup);

    // 2. Beaker with NaHCO3 solution & Elodea
    const beaker = this.beaker(0.75, 0x36a676);
    beaker.position.set(beakerX, 0.1, beakerZ);
    beaker.scale.setScalar(1.1);
    g.add(beaker);

    // 3. Elodea Stem & Leaves
    const stemGroup = new THREE.Group();
    const stemMat = new THREE.MeshStandardMaterial({ color: 0x2e7d32, roughness: 0.4 });
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 1.2, 12), stemMat);
    stem.position.y = 0.6;
    stemGroup.add(stem);
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x4caf50, roughness: 0.3, side: THREE.DoubleSide });
    for (let i = 0; i < 16; i++) {
      const leaf = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 0.08), leafMat);
      leaf.position.set(Math.sin(i * 1.2) * 0.06, 0.2 + i * 0.055, Math.cos(i * 1.2) * 0.06);
      leaf.rotation.set(0.3, i * 1.2, 0.2);
      stemGroup.add(leaf);
    }
    stemGroup.position.set(beakerX, 0.15, beakerZ);
    g.add(stemGroup);

    // 4. Massively Improved LED Desk Lamp Geometry aligned with ruler distance
    const lampX = 1.0 - (dist / 50) * 2.5;
    const lampGroup = new THREE.Group();

    // Heavy weighted circular base with rubber rim resting on bench (y = 0.1)
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x181a1d, metalness: 0.85, roughness: 0.25 });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.36, 0.06, 32), baseMat);
    lampGroup.add(base);
    const rubberMat = new THREE.MeshStandardMaterial({ color: 0x0c0d0e, roughness: 0.8 });
    const rubberRing = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.022, 12, 32), rubberMat);
    rubberRing.rotation.x = Math.PI / 2;
    rubberRing.position.y = 0.01;
    lampGroup.add(rubberRing);

    // Articulated dual chrome & matte black gooseneck arm
    const chromeMat = new THREE.MeshStandardMaterial({ color: 0xe8e8e8, metalness: 0.95, roughness: 0.1 });
    const lowerStem = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.55, 16), chromeMat);
    lowerStem.position.set(0, 0.3, 0);
    lampGroup.add(lowerStem);

    const jointMat = new THREE.MeshStandardMaterial({ color: 0x2b2e33, metalness: 0.7, roughness: 0.3 });
    const elbowJoint = new THREE.Mesh(new THREE.SphereGeometry(0.055, 16, 16), jointMat);
    elbowJoint.position.set(0, 0.58, 0);
    lampGroup.add(elbowJoint);

    const upperArm = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.75, 16), chromeMat);
    upperArm.position.set(0.18, 0.92, 0);
    upperArm.rotation.z = -0.45;
    lampGroup.add(upperArm);

    // Sleek Rectangular LED Lamp Head Hood with Heat Sink Fins
    const headGroup = new THREE.Group();
    const hoodMat = new THREE.MeshStandardMaterial({ color: 0x22252a, roughness: 0.3, metalness: 0.4 });
    const hood = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.12, 0.26), hoodMat);
    headGroup.add(hood);

    // Top Heat Sink Fins
    const finMat = new THREE.MeshStandardMaterial({ color: 0x889098, metalness: 0.8, roughness: 0.2 });
    for (let f = -0.14; f <= 0.14; f += 0.07) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.06, 0.22), finMat);
      fin.position.set(f, 0.08, 0);
      headGroup.add(fin);
    }

    // Underside LED Diffuser Panel
    const diffuserMat = new THREE.MeshBasicMaterial({ color: lampOn ? 0xffffff : 0xcccccc });
    const diffuser = new THREE.Mesh(new THREE.PlaneGeometry(0.38, 0.2), diffuserMat);
    diffuser.rotation.x = Math.PI / 2;
    diffuser.position.set(0, -0.061, 0);
    headGroup.add(diffuser);

    headGroup.position.set(0.48, 1.25, 0);
    headGroup.rotation.z = -Math.PI / 2.3;
    lampGroup.add(headGroup);

    // SpotLight cone
    if (lampOn) {
      const light = new THREE.SpotLight(0xfffaed, 5.0, 7, Math.PI / 5, 0.35);
      light.position.set(0.55, 1.22, 0);
      light.target.position.set(beakerX, 0.4, beakerZ);
      lampGroup.add(light);
      lampGroup.add(light.target);
    }

    lampGroup.position.set(lampX, 0.1, beakerZ);
    g.add(lampGroup);

    // 5. Dynamic Oxygen Bubbles rising from stem tip
    if (lampOn) {
      const bpm = Math.round(52 / Math.pow(dist / 10, 1.8) + 4);
      for (let b = 0; b < Math.min(15, Math.ceil(bpm / 3)); b++) {
        const bubble = new THREE.Mesh(
          new THREE.SphereGeometry(0.025 + (b % 3) * 0.008, 12, 12),
          new THREE.MeshPhysicalMaterial({ color: 0xe0ffff, transparent: true, opacity: 0.8, transmission: 0.9, roughness: 0.05 })
        );
        const phase = (b / 15);
        this.dynamic.push({
          kind: 'bubble',
          mesh: bubble,
          speed: 0.4 + (b % 4) * 0.1,
          phase,
          height: 0.8,
          startY: 0.8,
          baseY: 0.8
        });
        bubble.position.set(beakerX + (Math.random() - 0.5) * 0.08, 0.8, beakerZ + (Math.random() - 0.5) * 0.08);
        g.add(bubble);
      }
    }

    return shadowReady(g);
  }
  newton2Rig(state) {
    const g = new THREE.Group();
    const pos = state.newtonPos || 0;
    const force = state.newtonForce || 0.2;

    // 1. Solid Heavy Metallic Support Pillars elevating the runway to height y = 1.0
    const pillarMat = new THREE.MeshStandardMaterial({ color: 0x263238, metalness: 0.8, roughness: 0.25 });
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.9, 0.42), pillarMat);
    legL.position.set(-1.6, 0.55, 0);
    g.add(legL);

    const legR = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.9, 0.42), pillarMat);
    legR.position.set(1.6, 0.55, 0);
    g.add(legR);

    // 2. Elevated Extruded Aluminum Runway Track at y = 1.0
    const trackMat = new THREE.MeshStandardMaterial({ color: 0xb0bec5, metalness: 0.85, roughness: 0.2 });
    const track = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.08, 0.38), trackMat);
    track.position.set(0, 1.0, 0);
    g.add(track);

    // Side guide rails
    const railMat = new THREE.MeshStandardMaterial({ color: 0x0288d1, roughness: 0.3 });
    [-0.18, 0.18].forEach(rz => {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.03, 0.02), railMat);
      rail.position.set(0, 1.05, rz);
      g.add(rail);
    });

    // 3. End Pulley Assembly with a compact 45-degree overhanging arm at right end of runway
    const pulleyGroup = new THREE.Group();
    const clampMat = new THREE.MeshStandardMaterial({ color: 0x37474f, metalness: 0.8, roughness: 0.3 });
    const pClamp = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.10, 0.20), clampMat);
    pClamp.position.set(2.04, 1.02, 0);
    pulleyGroup.add(pClamp);

    // Compact 45-degree Angled Pole (length = 0.22)
    const armMat = new THREE.MeshStandardMaterial({ color: 0x90a4ae, metalness: 0.85, roughness: 0.2 });
    const pArm = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.22, 16), armMat);
    pArm.rotation.z = -Math.PI / 4; // 45 degrees up and right
    pArm.position.set(2.12, 1.12, 0);
    pulleyGroup.add(pArm);

    // Pulley Wheel & Axle at top of angled pole (x = 2.20, y = 1.20)
    const wheelCenter = new THREE.Vector3(2.20, 1.20, 0);
    const pWheelMat = new THREE.MeshStandardMaterial({ color: 0x263238, roughness: 0.3 });
    const pWheel = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.03, 24), pWheelMat);
    pWheel.rotation.x = Math.PI / 2;
    pWheel.position.copy(wheelCenter);
    pulleyGroup.add(pWheel);

    const axleMat = new THREE.MeshStandardMaterial({ color: 0xcfd8dc, metalness: 0.9, roughness: 0.1 });
    const pAxle = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.07, 12), axleMat);
    pAxle.position.copy(wheelCenter);
    pulleyGroup.add(pAxle);

    g.add(pulleyGroup);

    // 4. Red IR Photogates
    const gateMat = new THREE.MeshStandardMaterial({ color: 0xd32f2f, roughness: 0.4 });
    [-0.6, 1.0].forEach(gx => {
      const gate = new THREE.Group();
      const arch = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.45, 0.44), gateMat);
      arch.position.set(gx, 1.22, 0);
      gate.add(arch);
      const sensorMat = new THREE.MeshBasicMaterial({ color: 0x00e676 });
      const sensor = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 8), sensorMat);
      sensor.position.set(gx, 1.38, 0);
      gate.add(sensor);
      g.add(gate);
    });

    // 5. Dynamics Trolley with 4 Wheels & Stacked Steel Weights
    const trolleyX = -1.8 + pos * 3.5;
    const trolleyGroup = new THREE.Group();
    const chassisMat = new THREE.MeshStandardMaterial({ color: 0x0288d1, roughness: 0.3 });
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.12, 0.28), chassisMat);
    chassis.position.y = 1.12;
    trolleyGroup.add(chassis);

    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x212121, roughness: 0.5 });
    [[-0.18, -0.15], [-0.18, 0.15], [0.18, -0.15], [0.18, 0.15]].forEach(([wx, wz]) => {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.03, 16), wheelMat);
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(wx, 1.06, wz);
      trolleyGroup.add(wheel);
    });

    // 2 Stacked Mass Disks for Constant 1.0 kg Mass
    const weightMat = new THREE.MeshStandardMaterial({ color: 0x78909c, metalness: 0.7, roughness: 0.3 });
    for (let w = 0; w < 2; w++) {
      const weight = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.06, 20), weightMat);
      weight.position.set(0, 1.21 + w * 0.065, 0);
      trolleyGroup.add(weight);
    }
    trolleyGroup.position.x = trolleyX;
    g.add(trolleyGroup);

    // 6. Connecting String & Descending Mass Hanger
    // String drops vertically from the rightmost edge of pulley wheel (x = 2.29)
    const stringDropX = 2.29;
    const stringTopY = 1.29;
    const stringDropY = 1.20;
    const hangerY = 1.05 - pos * 0.65;
    const hookY = hangerY + 0.08 + force * 0.2;

    const stringMat = new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 2 });
    const stringGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(trolleyX + 0.28, 1.12, 0),
      new THREE.Vector3(wheelCenter.x, stringTopY, 0),
      new THREE.Vector3(stringDropX, stringDropY, 0),
      new THREE.Vector3(stringDropX, hookY, 0)
    ]);
    const stringLine = new THREE.Line(stringGeo, stringMat);
    g.add(stringLine);

    // Slotted Mass Hanger (Hanging off the compact 45° pulley clear of the runway)
    const hangerGroup = new THREE.Group();
    const hangerMat = new THREE.MeshStandardMaterial({ color: 0xffb300, metalness: 0.8, roughness: 0.2 });
    const hangerBody = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.14 + force * 0.4, 16), hangerMat);
    hangerBody.position.set(stringDropX, hangerY, 0);
    hangerGroup.add(hangerBody);

    const hookRing = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.007, 12, 16), hangerMat);
    hookRing.position.set(stringDropX, hookY, 0);
    hangerGroup.add(hookRing);

    g.add(hangerGroup);
    return shadowReady(g);
  }
  densityRig(state) {
    const g = new THREE.Group();
    const stage = state.densityStage || 0;
    const sampleIndex = state.densitySample || 0;
    const samples = [
      { name: 'Granite stone', mass: 187.5, vol: 75.0, density: 2.50, color: 0x78909c, shape: 'stone' },
      { name: 'Brass weight', mass: 212.5, vol: 25.0, density: 8.50, color: 0xd4af37, shape: 'brass' },
      { name: 'Aluminum block', mass: 108.0, vol: 40.0, density: 2.70, color: 0xb0bec5, shape: 'block' },
      { name: 'Steel nut', mass: 157.0, vol: 20.0, density: 7.85, color: 0x546e7a, shape: 'nut' }
    ];
    const sample = samples[sampleIndex] || samples[0];

    // 1. Electronic Balance on the Left (x = -2.2)
    const reading = stage === 0 ? 0 : stage === 1 ? sample.mass : 0;
    const bal = this.balance(reading);
    bal.scale.setScalar(0.85);
    bal.position.set(-2.2, 0, 0);
    g.add(bal);

    // 2. Eureka Can (Displacement Can) in Center (x = -0.3)
    const eurekaGroup = new THREE.Group();
    eurekaGroup.position.set(-0.3, 0, 0);

    // Riser Stand
    const riserMat = new THREE.MeshStandardMaterial({ color: 0x263238, roughness: 0.3 });
    const riser = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.12, 0.85), riserMat);
    riser.position.y = 0.06;
    eurekaGroup.add(riser);

    // Outer Metallic Can Body
    const canMat = new THREE.MeshStandardMaterial({ color: 0xcfd8dc, metalness: 0.85, roughness: 0.2 });
    const canBody = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 1.10, 32), canMat);
    canBody.position.y = 0.67;
    eurekaGroup.add(canBody);

    // Rim ring
    const innerRimMat = new THREE.MeshStandardMaterial({ color: 0x90a4ae, metalness: 0.8, roughness: 0.25 });
    const innerRim = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.02, 12, 32), innerRimMat);
    innerRim.rotation.x = Math.PI / 2;
    innerRim.position.y = 1.22;
    eurekaGroup.add(innerRim);

    // Eureka Spout (angled tube extending down & right)
    const spoutMat = new THREE.MeshStandardMaterial({ color: 0x90a4ae, metalness: 0.85, roughness: 0.2 });
    const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.35, 16), spoutMat);
    spout.rotation.z = -Math.PI / 6; // -30 degrees
    spout.position.set(0.48, 1.05, 0);
    eurekaGroup.add(spout);

    // Water level inside Eureka Can
    if (stage >= 2) {
      const waterMat = new THREE.MeshPhysicalMaterial({
        color: 0x29b6f6,
        transparent: true,
        opacity: 0.72,
        roughness: 0.1,
        transmission: 0.6,
        ior: 1.33
      });
      const eurekaWater = new THREE.Mesh(new THREE.CylinderGeometry(0.40, 0.40, 0.95, 32), waterMat);
      eurekaWater.position.y = 0.60;
      eurekaGroup.add(eurekaWater);

      const surfaceMat = new THREE.MeshPhysicalMaterial({
        color: 0x81d4fa,
        transparent: true,
        opacity: 0.8,
        roughness: 0.05
      });
      const waterSurface = new THREE.Mesh(new THREE.CircleGeometry(0.40, 32), surfaceMat);
      waterSurface.rotation.x = -Math.PI / 2;
      waterSurface.position.y = 1.075;
      eurekaGroup.add(waterSurface);
    }
    g.add(eurekaGroup);

    // 3. Measuring Cylinder under spout on Right (x = 0.8)
    const cylGroup = new THREE.Group();
    cylGroup.position.set(0.8, 0, 0);

    const cylGlassMat = new THREE.MeshPhysicalMaterial({
      color: 0xe0f7fa,
      transparent: true,
      opacity: 0.38,
      roughness: 0.1,
      transmission: 0.85
    });
    // Hex Base
    const cylBase = new THREE.Mesh(new THREE.CylinderGeometry(0.30, 0.32, 0.05, 6), riserMat);
    cylBase.position.y = 0.025;
    cylGroup.add(cylBase);

    // Glass Cylinder Tube
    const cylTube = new THREE.Mesh(new THREE.CylinderGeometry(0.20, 0.20, 1.15, 32), cylGlassMat);
    cylTube.position.y = 0.60;
    cylGroup.add(cylTube);

    // Graduation rings
    const markMat = new THREE.MeshBasicMaterial({ color: 0x37474f });
    for (let m = 1; m <= 8; m++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.201, 0.004, 8, 24), markMat);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.12 + m * 0.11;
      cylGroup.add(ring);
    }

    // Displaced Water inside Measuring Cylinder
    const animProgress = stage === 3 ? Math.min(1, (state.densityTimer || 0) / 4.0) : stage >= 4 ? 1.0 : 0;
    const targetVol = sample.vol;
    const currentVol = targetVol * animProgress;
    if (currentVol > 0.5) {
      const fillFraction = currentVol / 100.0;
      const cylWaterHeight = Math.max(0.04, fillFraction * 0.90);
      const cylWaterMat = new THREE.MeshPhysicalMaterial({
        color: 0x29b6f6,
        transparent: true,
        opacity: 0.75,
        roughness: 0.1,
        transmission: 0.6,
        ior: 1.33
      });
      const cylWater = new THREE.Mesh(new THREE.CylinderGeometry(0.185, 0.185, cylWaterHeight, 32), cylWaterMat);
      cylWater.position.y = 0.05 + cylWaterHeight / 2;
      cylGroup.add(cylWater);

      const cylMeniscus = new THREE.Mesh(new THREE.CircleGeometry(0.185, 32), new THREE.MeshBasicMaterial({ color: 0x81d4fa, transparent: true, opacity: 0.85 }));
      cylMeniscus.rotation.x = -Math.PI / 2;
      cylMeniscus.position.y = 0.05 + cylWaterHeight;
      cylGroup.add(cylMeniscus);
    }
    g.add(cylGroup);

    // 4. Irregular Solid Object
    let objGeo;
    if (sample.shape === 'brass') {
      objGeo = new THREE.OctahedronGeometry(0.16, 1);
    } else if (sample.shape === 'block') {
      objGeo = new THREE.BoxGeometry(0.22, 0.18, 0.20);
    } else if (sample.shape === 'nut') {
      objGeo = new THREE.TorusGeometry(0.12, 0.06, 12, 6);
    } else {
      objGeo = new THREE.DodecahedronGeometry(0.18, 1);
    }
    const objMat = new THREE.MeshStandardMaterial({
      color: sample.color,
      metalness: sample.shape === 'brass' || sample.shape === 'nut' ? 0.8 : 0.2,
      roughness: sample.shape === 'stone' ? 0.8 : 0.3
    });
    const solidMesh = new THREE.Mesh(objGeo, objMat);

    // Position of solid object
    let objX, objY, objZ = 0;
    if (stage === 0 || stage === 1) {
      // On balance pan
      objX = -2.2;
      objY = 0.78;
    } else if (stage === 2) {
      // Suspended above Eureka Can
      objX = -0.3;
      objY = 1.75;
    } else if (stage === 3) {
      // Animating down into Eureka Can
      const q = Math.min(1, (state.densityTimer || 0) / 4.0);
      const ease = q * q * (3 - 2 * q);
      objX = -0.3;
      objY = 1.75 - ease * 1.30;
    } else {
      // Submerged inside Eureka Can
      objX = -0.3;
      objY = 0.45;
    }
    solidMesh.position.set(objX, objY, objZ);
    g.add(solidMesh);

    // String (if stage >= 2)
    if (stage >= 2) {
      const stringMat = new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 2 });
      const stringGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(objX, 2.4, objZ),
        new THREE.Vector3(objX, objY + 0.15, objZ)
      ]);
      const stringLine = new THREE.Line(stringGeo, stringMat);
      g.add(stringLine);
    }

    // Water Stream pouring from Spout to Measuring Cylinder
    if (stage === 3 && animProgress > 0.05 && animProgress < 0.98) {
      const spoutTip = new THREE.Vector3(0.33, 0.98, 0);
      const cylFillY = 0.05 + (currentVol / 100.0) * 0.90;
      const cylTarget = new THREE.Vector3(0.80, cylFillY, 0);

      const streamPoints = [];
      const steps = 12;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const x = spoutTip.x + t * (cylTarget.x - spoutTip.x);
        const y = spoutTip.y + t * (cylTarget.y - spoutTip.y) - Math.sin(t * Math.PI) * 0.08;
        streamPoints.push(new THREE.Vector3(x, y, 0));
      }
      const streamGeo = new THREE.BufferGeometry().setFromPoints(streamPoints);
      const streamMat = new THREE.LineBasicMaterial({ color: 0x81d4fa, linewidth: 4 });
      const streamLine = new THREE.Line(streamGeo, streamMat);
      g.add(streamLine);
    }

    return shadowReady(g);
  }
  rebuild(state,p){this.clear();const id=p.id;
    if(id==='free'){
      for(const it of state.workspace){let anchor=it,elevation=0;if((it.type==='beaker'||it.type==='flask')&&it.snappedTo){const support=state.workspace.find(a=>a.uid===it.snappedTo&&a.type==='tripod');if(support){anchor=support;elevation=2.1}}const pos=this.posFromScreen(anchor.x,anchor.y),flameHeight=it.type==='bunsen'?this.freeBunsenHeight(it,state):1,o=this.itemObject(it,flameHeight);this.add(o,pos.x,pos.z,elevation,1.15);if(state.drag?.targetUid===it.uid){const ring=new THREE.Mesh(new THREE.TorusGeometry(1,.045,12,48),new THREE.MeshBasicMaterial({color:0x20d4b0}));ring.rotation.x=Math.PI/2;ring.position.set(pos.x,elevation+.05,pos.z);this.root.add(ring)}if(it.type==='tripod'&&state.drag?.snapUid===it.uid){const target=new THREE.Mesh(new THREE.TorusGeometry(.88,.055,16,72),new THREE.MeshBasicMaterial({color:0x21d6b1,transparent:true,opacity:.92,depthWrite:false}));target.rotation.x=Math.PI/2;target.position.set(pos.x,2.17,pos.z);target.renderOrder=12;this.root.add(target)}}
      if(state.drag?.kind==='palette'){const pos=this.posFromScreen(state.drag.x,state.drag.y),ghost=this.itemObject({type:state.drag.type});ghost.traverse(o=>{if(o.material){o.material=o.material.clone();o.material.transparent=true;o.opacity=.35}});this.add(ghost,pos.x,pos.z,0,1.08)}
    }
    else if(id==='rates'){
      const transfer=Math.min(1,state.transferred||0),stage=state.ratesStage||0,moveQ=stage===1?Math.max(0,Math.min(1,(state.ratesStageTimer||0)/1.8)):stage===0?0:1,ease=moveQ*moveQ*(3-2*moveQ),bathPos=new THREE.Vector3(2.55,.43,-.42),crossPos=new THREE.Vector3(-.15,.12,.25),receiverPos=new THREE.Vector3().lerpVectors(bathPos,crossPos,ease);if(stage===1)receiverPos.y+=Math.sin(Math.PI*ease)*.72;
      this.add(this.ratesCrossPaper(),crossPos.x,crossPos.z,0,.98);this.add(this.electricWaterBath(state.ratesBathTemp||20,state.ratesTargetTemp||20,!!state.ratesConditioning),bathPos.x,bathPos.z,0,.95);
      const source=this.add(this.flask(.6-transfer*.34,0xc8e8ee),-2.1,.1,0,.88),q=Math.max(0,Math.min(1,state.progress||0)),solutionColor=new THREE.Color(0xd8eef1).lerp(new THREE.Color(0xe5cc55),q).getHex(),receiver=this.flask(.46+transfer*.22,solutionColor);receiver.scale.setScalar(.9);receiver.position.copy(receiverPos);if(stage===3&&(!state.pour||transfer>.03))receiver.add(this.bubbleCloud(18,.44,.5,0xffeb8a));if(q>.015)receiver.add(this.ratesSulfurCloud(q));this.root.add(receiver);const target=receiver;
      if(state.pour){
        const t=state.pour.t||0,clamp=v=>Math.max(0,Math.min(1,v)),smooth=v=>{v=clamp(v);return v*v*(3-2*v)},approach=smooth(t/.9),retreat=smooth((t-2.78)/.82),tilt=smooth((t-.68)/.48)*(1-smooth((t-2.42)/.42)),lipAnchor=smooth((t-.82)/.26)*(1-smooth((t-2.5)/.28)),start=new THREE.Vector3(-2.1,0,.1),pourPosition=new THREE.Vector3(crossPos.x-1.87,1.52,crossPos.z-.20),pose=new THREE.Vector3().lerpVectors(start,pourPosition,approach);
        if(retreat>0)pose.lerpVectors(pourPosition,start,retreat);
        pose.y+=retreat>0?Math.sin(retreat*Math.PI)*.16:Math.sin(approach*Math.PI)*.12;source.position.copy(pose);source.rotation.z=-1.2*tilt;
        const aligned=this.anchorPouringLip(source,target,{sourceLip:new THREE.Vector3(0,1.95,0),receiverOpening:new THREE.Vector3(0,1.72,0),clearance:.4,weight:lipAnchor});
        if(t>1.08&&t<2.5){
          this.root.add(this.liquidPourStream(aligned.mouth,aligned.opening,{color:0xa9f0ff,time:t,radius:.053,opacity:.76,sag:.025,breakup:.72,droplets:5,splash:true}));
        }
      }
    }
    else if(id==='temp'){
      const transfer=Math.min(1,state.transferred||0),source=this.add(this.flask(.62-transfer*.34,0xc8e8ee),-2.1,.1,0,.88),receiver=this.flask(.48+transfer*.24,0xc05b8e);if(state.running&&(!state.pour||transfer>.03))receiver.add(this.bubbleCloud(12,.46,.55,0xf8ffff));const target=this.add(receiver,1.25,.05,0,1.04);
      if(state.pour){const t=state.pour.t||0,clamp=v=>Math.max(0,Math.min(1,v)),smooth=v=>{v=clamp(v);return v*v*(3-2*v)},approach=smooth(t/.9),retreat=smooth((t-2.78)/.82),tilt=smooth((t-.68)/.48)*(1-smooth((t-2.42)/.42)),lipAnchor=smooth((t-.82)/.26)*(1-smooth((t-2.5)/.28)),start=new THREE.Vector3(-2.1,0,.1),pourPosition=new THREE.Vector3(-1.15,1.52,.05),pose=new THREE.Vector3().lerpVectors(start,pourPosition,approach);if(retreat>0)pose.lerpVectors(pourPosition,start,retreat);pose.y+=retreat>0?Math.sin(retreat*Math.PI)*.16:Math.sin(approach*Math.PI)*.12;source.position.copy(pose);source.rotation.z=-1.2*tilt;const aligned=this.anchorPouringLip(source,target,{sourceLip:new THREE.Vector3(0,1.95,0),receiverOpening:new THREE.Vector3(0,1.72,0),clearance:.4,weight:lipAnchor});if(t>1.08&&t<2.5)this.root.add(this.liquidPourStream(aligned.mouth,aligned.opening,{color:0xa9f0ff,time:t,radius:.053,opacity:.76,sag:.025,breakup:.72,droplets:5,splash:true}))}
      this.add(this.thermometer(state.temp),1.25,.24,.02,.8)
    }
    else if(id==='salts'){
      const stage=state.saltsStage||0,t=state.saltsTimer||0;
      if(stage===0||stage===1){
        const beaker=this.beaker(stage===1?0.35+(t/2.5)*0.05:0.35,0xd0e8ef);this.add(beaker,0,.1,0,1.0);
        if(stage===1){
          const pourQ=Math.min(1,t/1.5),cPos=new THREE.Vector3(1.5,0,.1).lerp(new THREE.Vector3(-.28,2.05,.1),pourQ),cRot=pourQ*-1.8,c=this.crucible({product:true,productColor:0x111111,productScale:1-Math.max(0,(t-1.5))});c.position.copy(cPos);c.rotation.z=cRot;this.root.add(c);
          if(t>1.4&&t<2.5){this.root.updateMatrixWorld(true);const powderStart=c.localToWorld(new THREE.Vector3(.47,.39,0)),powderEnd=beaker.localToWorld(new THREE.Vector3(0,.49,0));this.root.add(this.granularPour(powderStart,powderEnd,t,{color:0x111111,count:32}))}
        }
      }else if(stage===2){
        const appearQ=Math.min(1,t/1.0),pourQ=Math.max(0,Math.min(1,(t-1.2)/1.5)),flask=this.flask(.1+pourQ*.25,0x319bd3),funnel=this.filterFunnel();funnel.position.y=1.9;flask.add(funnel);const fPos=new THREE.Vector3(2.5,.1,.1).lerp(new THREE.Vector3(0,.1,.1),Math.pow(appearQ,.5));this.add(flask,fPos.x,fPos.z,fPos.y,1.0);const bPos=appearQ<1?new THREE.Vector3(0,.1,0).lerp(new THREE.Vector3(-1.8,0,.1),Math.pow(appearQ,.5)):new THREE.Vector3(-1.8,0,.1).lerp(new THREE.Vector3(-1.45,3.36,.1),pourQ>0?Math.min(1,pourQ*3):0),bRot=pourQ>0?-1.4*Math.min(1,pourQ*3):0,beaker=this.beaker(.4-pourQ*.4,0x319bd3);beaker.position.copy(bPos);beaker.rotation.z=bRot;this.root.add(beaker);
        if(pourQ>.2&&pourQ<.9){this.root.updateMatrixWorld(true);const sourceMouth=beaker.localToWorld(new THREE.Vector3(.62,1.3,0)),funnelMouth=flask.localToWorld(new THREE.Vector3(0,2.8,.02)),filterExit=flask.localToWorld(new THREE.Vector3(0,1.91,.02)),filtrateSurface=flask.localToWorld(new THREE.Vector3(0,.43,.02));this.root.add(this.liquidPourStream(sourceMouth,funnelMouth,{color:0x4eb7e5,time:t,radius:.043,opacity:.76,sag:.035,breakup:.7,droplets:4,splash:true}));this.root.add(this.liquidPourStream(filterExit,filtrateSurface,{color:0x4eb7e5,time:t+.37,radius:.023,opacity:.68,sag:.012,breakup:.42,droplets:7,splash:false}))}
      }else if(stage===3||stage===4){
        let baseZ=.1,dishY=1.88,dishX=0,dishZ=.1,dishScale=.96,crystalsQ=0;
        if(stage===4){
          // Take the basin forward past the gauze first, then lower it.  The
          // two eased phases avoid the old diagonal path through the tripod.
          const moveQ=Math.min(1,t/2.8),frontQ=Math.min(1,moveQ/.62),dropQ=Math.max(0,Math.min(1,(moveQ-.62)/.38));
          const ease=q=>q*q*(3-2*q),frontEase=ease(frontQ),dropEase=ease(dropQ);
          baseZ=.1-dropEase*.4;
          dishZ=.1+frontEase*2.35+dropEase*.2;
          dishY=1.88-dropEase*1.80;
          crystalsQ=Math.max(0,Math.min(1,(t-2.8)/2.2));
        }
        this.add(this.tripod(),0,baseZ);this.add(this.bunsen(state.burner,.76),0,baseZ);const basin=this.evaporatingBasin(crystalsQ);if(stage===3&&state.burner)basin.add(this.bubbleCloud(18,.4,.3));this.add(basin,dishX,dishZ,dishY,dishScale)
      }
    }
    else if(id==='mass'){const stage=state.massStage||0,transfer=state.massTransfer,q=Math.min(1,(transfer?.t||0)/1.55),settle=transfer?.direction==='toBalance'&&q>.66?4.18+Math.sin(q*34)*(1-q)*.24:0,reading=stage===0?4.01:stage===7?4.18:settle;this.add(this.balance(reading),-2.5,.2,0,.9);this.add(this.tripod(),1.3,.05);this.add(this.bunsen(state.burner,.8),1.3,.05);let pos=stage===0||stage===7?new THREE.Vector3(-2.5,.83,.2):new THREE.Vector3(1.3,1.87,.05);if(transfer){const from=transfer.direction==='toTripod'?new THREE.Vector3(-2.5,.83,.2):new THREE.Vector3(1.3,1.87,.05),to=transfer.direction==='toTripod'?new THREE.Vector3(1.3,1.87,.05):new THREE.Vector3(-2.5,.83,.2),ease=q*q*(3-2*q);pos=new THREE.Vector3().lerpVectors(from,to,ease);pos.y+=Math.sin(Math.PI*q)*1.12}const product=stage>=5;this.add(this.crucible({burning:stage===4&&state.running,lidOn:state.massLidOn,product}),pos.x,pos.z,pos.y,1.08)}
    else if(id==='hydrogen'){this.root.add(this.hydrogenRig(state))}
    else if(id==='titration'){this.root.add(this.titrationRig(state))}
    else if(id==='co2'){
      const q=Math.max(0,Math.min(1,state.progress||0)),scale=.98,leftX=-1.68,rightX=1.58,z=.05;
      const reaction=this.flask(.5+(state.transferred||0)*.12,0xd6d0ad);reaction.add(this.oneHoleBung(1.65,2.19));if(state.running)reaction.add(this.bubbleCloud(18,.42,.72));this.add(reaction,leftX,z,0,scale);
      const limeColour=new THREE.Color(0xcceff3).lerp(new THREE.Color(0xf0efe5),q).getHex(),limewater=this.flask(.68,limeColour),liquid=limewater.userData.liquid,meniscus=limewater.userData.meniscus;
      if(liquid){liquid.material.opacity=.38+q*.5;liquid.material.transmission=.52*(1-q);liquid.material.roughness=.08+q*.62}
      if(meniscus){meniscus.material.opacity=.34+q*.46;meniscus.material.transmission=.46*(1-q);meniscus.material.roughness=.08+q*.55}
      limewater.add(this.oneHoleBung(.14,2.19),this.co2TurbidityCloud(q),this.co2BubblePlume());this.add(limewater,rightX,z,0,scale);
      const tubeY=2.19*scale;this.root.add(this.co2DeliveryTube(new THREE.Vector3(leftX,tubeY,z),new THREE.Vector3(rightX,tubeY,z)));
    }
    else if(id==='electro'){this.root.add(this.electrolysisRig(state))}
    else if(id==='flame'){this.root.add(this.flameTestRig(state))}
    else if(id==='displacement'){this.root.add(this.displacementRig(state))}
    else if(id==='chrom'){this.add(this.beaker(.16,0x87cad8),0,.1,0,1.18);this.add(this.chromatographyPaper(),0,.18,1.25,1.05)}
    else if(id==='water'){this.root.add(this.waterDistillationRig(state))}
    else if(id==='thermite'){this.root.add(this.thermiteRig(state))}
    else if(id==='pondweed'){this.root.add(this.pondweedRig(state))}
    else if(id==='newton2'){this.root.add(this.newton2Rig(state))}
    else if(id==='density'){this.root.add(this.densityRig(state))}
  }
  sync(state,p){
    if(!this.available)return;
    // Pointer moves can fire dozens of times per second. Keep the WebGL scene
    // stable while dragging instead of rebuilding all glassware on every
    // pixel; pointer-up commits the position and rebuilds once. Snap feedback
    // remains live through targetUid/snapUid.
    const dragUid=state.drag?.kind==='workspace'?state.drag.uid:null;
    const visualDrag=state.drag&&['palette','free-reactant','workspace'].includes(state.drag.kind)?{kind:state.drag.kind,type:state.drag.type,uid:state.drag.uid,targetUid:state.drag.targetUid,snapUid:state.drag.snapUid}:state.drag?{kind:state.drag.kind}:null;
    const visualWorkspace=state.workspace.map(({temperature,reaction,...it})=>{const frozen=dragUid===it.uid&&state.drag?.origin;const view=frozen?{...it,x:state.drag.origin.x,y:state.drag.origin.y}:it;return {...view,temperatureBand:Math.floor((temperature||20)/10),reaction:reaction&&{ruleId:reaction.ruleId,progress:Math.round((reaction.progress||0)*20),complete:!!reaction.complete}}});
    const temperatureKey=p.id==='temp'?Math.round((state.temp||20)*10):p.id==='rates'?Math.round((state.ratesBathTemp||20)*10):0;
    const signature=JSON.stringify({id:p.id,workspace:visualWorkspace,drag:visualDrag,running:p.id==='titration'||p.id==='thermite'||p.id==='displacement'?false:state.running,burner:state.burner,coolingWater:state.coolingWater,pour:!!state.pour,pourTick:state.pour&&Math.round(state.pour.t*24),lastReactant:state.lastReactant,transferred:Math.round((state.transferred||0)*20),temperature:temperatureKey,ratesStage:state.ratesStage,ratesTick:p.id==='rates'?Math.round((state.ratesStageTimer||0)*18):0,ratesTarget:state.ratesTargetTemp,ratesConditioning:!!state.ratesConditioning,massStage:state.massStage,massLidOn:state.massLidOn,massTransfer:state.massTransfer&&{direction:state.massTransfer.direction,tick:Math.round(state.massTransfer.t*12)},massProgress:['water','electro','titration','thermite','displacement'].includes(p.id)?0:Math.round((state.progress||0)*20),electroWeighing:!!state.electroWeighing,electroRecorded:!!state.electroRecorded,hydrogenStage:state.hydrogenStage,hydrogenTick:Math.round((state.hydrogenTimer||0)*6),hydrogenGas:Math.round((state.hydrogenGas||0)/2),saltsStage:state.saltsStage,saltsTick:Math.round((state.saltsTimer||0)*10),flameTestStage:state.flameTestStage,flameTestSalt:state.flameTestSalt,flameTestTested:state.flameTestTested,titrationStage:state.titrationStage,titrationIndicator:state.titrationIndicator,titrationIndicatorAdding:(state.titrationIndicatorTimer||0)>0,titrationComplete:p.id==='titration'&&state.complete,titrationDropping:(state.titrationDropTimer||0)>0,titrationReading:p.id==='titration'&&!state.running?Math.round((state.titrationVolume||0)*20):0,displacementStage:state.displacementStage,thermiteComplete:p.id==='thermite'&&!!state.complete,pondweedDistance:state.pondweedDistance,pondweedLampOn:state.pondweedLampOn,newtonForce:state.newtonForce,newtonMass:state.newtonMass,newtonPos:Math.round((state.newtonPos||0)*50)});
    if(signature!==this.signature){this.signature=signature;this.rebuild(state,p)}
  }
  render(time,state,p){
    if(!this.available)return;const frameDt=this.lastRenderTime?Math.min(.05,Math.max(0,(time-this.lastRenderTime)/1000)):1/60;this.lastRenderTime=time;this.coolantTransitionTarget=state.coolingWater?1:0;this.coolantVisualLevel=THREE.MathUtils.lerp(this.coolantVisualLevel,this.coolantTransitionTarget,1-Math.exp(-frameDt*4.4));if(Math.abs(this.coolantVisualLevel-this.coolantTransitionTarget)<.002)this.coolantVisualLevel=this.coolantTransitionTarget;this.sync(state,p);this.camera.position.set(0,4.65,8.55);this.camera.lookAt(0,1.05,0);
    for(const f of this.flames){const seconds=time*.001,pulse=1+Math.sin(time*.009+f.seed)*.018+Math.sin(time*.021+f.seed)*.009,lean=Math.sin(time*.0047+f.seed)*.0018;f.uniforms.uTime.value=seconds;f.veilUniforms.uTime.value=seconds;f.sheet.scale.set(pulse,f.height*(1+Math.sin(time*.012+f.seed)*.022),1);f.veil.scale.set(.82/pulse,f.height*(1.02+Math.sin(time*.015+f.seed)*.026),.82);f.sheet.rotation.z=lean;f.veil.rotation.z=-lean*.7;f.glow.intensity=3.4+Math.sin(time*.011+f.seed)*.28;if(f.wrap){const wrapPulse=.92+.1*Math.sin(time*.014+f.seed);f.wrap.scale.set(wrapPulse,.98,wrapPulse*.72);f.wrap.material.opacity=.22+.08*Math.sin(time*.011+f.seed);for(const jet of f.wrapJets)jet.scale.x=wrapPulse;}if(f.jets){const spatulaAbove=(p.id==='flame'&&(state.flameTestStage===3||state.flameTestStage>=4));for(let i=0;i<f.jets.length;i++){const jet=f.jets[i],dy=(Math.sin(seconds*24.0+i*2.3+f.seed)*.007+Math.sin(seconds*48.0+i*4.1)*.0035)*(1+(spatulaAbove?.6:0));jet.position.y=1.38+dy;jet.scale.y=1.0+Math.sin(seconds*32.0+i*3.3)*.18;const n1=Math.sin(seconds*16.0+i*3.7+f.seed),n2=Math.sin(seconds*35.0+i*5.3),rawFlicker=n1*.6+n2*.4,thresh=spatulaAbove?.22:.78;let opacity=.52;if(rawFlicker>thresh){const dip=Math.abs(Math.sin((rawFlicker-thresh)*22.0));opacity*=spatulaAbove?.05+.25*dip:.2+.3*dip}jet.material.opacity=opacity}}}
    for(const d of this.dynamic){
      if(d.kind==='bubble'){const q=(time*.001*d.speed+d.phase)%1;d.mesh.position.y=d.mesh.userData.baseY+q*d.height;const pulse=.82+Math.sin(time*.006+d.phase*20)*.18;d.mesh.scale.setScalar(pulse)}
      else if(d.kind==='flameTest'){
        const stage=state.flameTestStage||0,t=Math.max(0,state.flameTestTimer||0),clamp=q=>Math.max(0,Math.min(1,q)),smooth=q=>{q=clamp(q);return q*q*(3-2*q)},above=d.jarPoint.clone().add(new THREE.Vector3(0,.4,0)),dip=d.jarPoint.clone().add(new THREE.Vector3(0,-.16,0));let point=d.restPoint.clone(),rotation=.05;
        if(stage===1){if(t<.62){const q=smooth(t/.62);point.lerpVectors(d.restPoint,above,q);point.y+=Math.sin(Math.PI*q)*.5;rotation=THREE.MathUtils.lerp(.05,-.08,q)}else if(t<1.24){const q=smooth((t-.62)/.62);point.lerpVectors(above,dip,q);rotation=THREE.MathUtils.lerp(-.08,-.24,q)}else{const q=smooth((t-1.24)/.91);point.lerpVectors(dip,above,q);rotation=THREE.MathUtils.lerp(-.24,-.06,q)}}else if(stage===2){point.copy(above);rotation=-.06}else if(stage===3){const q=smooth(t/1.18);point.lerpVectors(above,d.flamePoint,q);point.y+=Math.sin(Math.PI*q)*.7;rotation=THREE.MathUtils.lerp(-.06,-.02,q)}else if(stage>=4){point.copy(d.flamePoint);rotation=-.02}
        d.spatula.position.copy(point);d.spatula.rotation.set(0,0,rotation);d.saltLoad.visible=stage>=2||stage===1&&t>.78;
        const saltX=point.x-.12,saltY=point.y+.035,saltZ=point.z;
        d.outer.position.set(saltX,saltY,saltZ);d.core.position.set(saltX,saltY,saltZ);d.halo.position.set(saltX,saltY,saltZ);d.colourLight.position.set(saltX,saltY+.5,saltZ);
        const active=stage>=4||stage===3&&t>.95,level=stage>=4?1:active?smooth((t-.95)/.55):0,pulse=active?1+.045*Math.sin(time*.027+d.seed)+.018*Math.sin(time*.053):1;d.outer.visible=d.core.visible=d.halo.visible=active;d.outer.scale.set(pulse,1+.035*Math.sin(time*.031+d.seed),pulse);d.core.scale.set(1/pulse,1+.048*Math.sin(time*.037+d.seed),1/pulse);d.halo.scale.set(.9*pulse,1.18*(1+.025*Math.sin(time*.021)),.9*pulse);d.outerMat.opacity=.23*level;d.coreMat.opacity=.38*level;d.haloMat.opacity=.12*level;d.colourLight.intensity=level*(5.4+.6*Math.sin(time*.023+d.seed))
      }
      else if(d.kind==='co2Bubble'){const active=!!state.running,q=(time*.001*d.speed+d.phase)%1,spread=.018+q*.13,side=Math.sin(q*12.4+d.angle)*spread;d.mesh.visible=active;d.mesh.position.set(Math.cos(d.angle)*spread*.55+side*.32,THREE.MathUtils.lerp(d.startY,d.surfaceY,q),Math.sin(d.angle)*spread*.46);d.mesh.material.opacity=active?Math.sin(Math.PI*Math.min(.999,q))*(.72+(d.angle%1)*.12):0;const pulse=.78+q*.52+Math.sin(time*.009+d.angle)*.08;d.mesh.scale.set(pulse,pulse*(1.06+q*.22),pulse)}
      else if(d.kind==='electroCopper'){const q=Math.max(0,Math.min(1,state.progress||0)),height=.012+d.maxHeight*q;d.sleeve.visible=q>.004;d.sleeve.scale.y=height/d.maxHeight;d.sleeve.position.y=d.baseY+height/2;for(const n of d.nodules){const raw=Math.max(0,Math.min(1,(q-n.threshold)/.18)),grow=raw*raw*(3-2*raw);n.mesh.visible=grow>.008;n.mesh.scale.setScalar(Math.max(.001,grow*(.82+.18*Math.sin(time*.004+n.threshold*17))))}d.solution.material.color.copy(d.startColor).lerp(d.endColor,q*.62);d.meniscus.material.color.copy(d.startColor).lerp(d.endColor,q*.62)}
      else if(d.kind==='displacementTube'){const clamp=q=>Math.max(0,Math.min(1,q)),smooth=q=>{q=clamp(q);return q*q*(3-2*q)},stage=state.displacementStage||0,t=stage===0?0:stage>=2?6.4:Math.max(0,state.displacementTimer||0),drop=smooth((t-d.index*.12)/1.08),reaction=smooth(clamp((t-1.0-d.index*.15)/(4.75/d.rate)));d.strip.position.y=THREE.MathUtils.lerp(2.72,.79,drop);d.coat.visible=reaction>.008;d.coat.scale.y=Math.max(.001,reaction);d.liquidMat.color.copy(d.startColor).lerp(d.endColor,reaction);d.meniscusMat.color.copy(d.startColor).lerp(d.endColor,reaction);d.liquidMat.opacity=.72+.08*reaction;d.meniscusMat.opacity=.68+.1*reaction;for(const n of d.nodules){const grow=smooth((reaction-n.threshold)/.18);n.mesh.visible=grow>.008;n.mesh.scale.setScalar(Math.max(.001,grow*(.76+.16*Math.sin(time*.004+n.threshold*21))))}for(const flake of d.settled){const grow=smooth((reaction-flake.threshold)/.16);flake.mesh.visible=grow>.008;flake.mesh.scale.setScalar(Math.max(.001,grow*(.72+.2*Math.sin(time*.003+flake.threshold*17))))}const active=stage===1&&reaction>.02&&reaction<.99;d.swirl.visible=active;d.swirl.position.y=.56+.32*((time*.00045+d.index*.21)%1);d.swirl.rotation.z=time*.0008*(d.index%2?1:-1);d.swirl.scale.set(.6+reaction*.8,.6+reaction*.8,.44+reaction*.52);d.swirlMat.opacity=active?(1-reaction)*.22+.035:0}
      else if(d.kind==='electroWeigh'){const active=!!state.electroWeighing||!!state.electroRecorded,t=state.electroRecorded?d.duration:Math.max(0,state.electroWeighTimer||0),smooth=value=>{value=Math.max(0,Math.min(1,value));return value*value*(3-2*value)};d.movingCathode.visible=active;d.cathodeRod.visible=!active;d.cathodeBand.visible=!active;d.originalSleeve.visible=!active&&d.originalSleeve.visible;for(const n of d.originalNodules)n.mesh.visible=!active&&n.mesh.visible;const release=active?smooth(t/.34):0;d.cathodeClip.rotation.z=-.24*release;d.cathodeClip.position.x=d.start.x-.065*release;if(active){if(t<.8){const q=smooth(t/.8);d.movingCathode.position.lerpVectors(d.start,d.lifted,q);d.movingCathode.rotation.z=0}else if(t<2.5){const q=smooth((t-.8)/1.7);d.movingCathode.position.lerpVectors(d.lifted,d.aboveBalance,q);d.movingCathode.position.y+=Math.sin(q*Math.PI)*.24;d.movingCathode.rotation.z=0}else if(t<3.6){const q=smooth((t-2.5)/1.1);d.movingCathode.position.lerpVectors(d.aboveBalance,d.onBalance,q);d.movingCathode.rotation.z=Math.PI/2*q}else{const settle=Math.max(0,Math.min(1,(t-3.6)/(d.duration-3.6)));d.movingCathode.position.copy(d.onBalance);d.movingCathode.position.y+=Math.abs(Math.sin((t-3.6)*19))*(1-settle)*.035;d.movingCathode.rotation.z=Math.PI/2}}else{d.movingCathode.position.copy(d.start);d.movingCathode.rotation.z=0}let reading=0;if(state.electroRecorded)reading=13.24;else if(state.electroWeighing&&t>=3.55){const settle=Math.max(0,Math.min(1,(t-3.55)/(d.duration-3.55)));reading=13.24+Math.sin(t*24)*(1-settle)*.28}if(d.balanceDisplay){const {canvas,context:dc,texture}=d.balanceDisplay;dc.clearRect(0,0,canvas.width,canvas.height);dc.fillStyle='#071d20';dc.fillRect(0,0,canvas.width,canvas.height);dc.shadowColor='#77ffe1';dc.shadowBlur=18;dc.fillStyle='#83f7df';dc.font='700 70px ui-monospace, SFMono-Regular, Menlo, monospace';dc.textAlign='right';dc.textBaseline='middle';dc.fillText(`${reading.toFixed(2)} g`,476,67);texture.needsUpdate=true}}
      else if(d.kind==='freeReaction'){const reaction=d.reaction,q=Math.max(0,Math.min(1,reaction.progress||0)),active=!reaction.complete,pulse=.9+.15*Math.sin(time*.012+d.seed);d.glow.material.opacity=(active?.09:.035)+Math.sin(time*.01+d.seed)*.018;d.glow.scale.setScalar(pulse*(1+.22*Math.sin(q*Math.PI)));d.precip.visible=!!reaction.precipitate;d.precip.scale.setScalar(Math.max(.05,q));for(let i=0;i<d.precip.children.length;i++){const flake=d.precip.children[i],phase=(time*.0007+i*.13)%1;flake.position.y=.12+(i%5)*.045+phase*.08;flake.material.opacity=reaction.precipitate?(.18+.55*q)*(active?.85:1):0}for(let i=0;i<d.bubbles.length;i++){const bubble=d.bubbles[i],phase=(time*.0008*(.8+(i%3)*.12)+i*.173)%1,visible=!!reaction.gas&&(active||phase<.34);bubble.visible=visible;if(visible){const angle=bubble.userData.angle,r=.055+(i%4)*.045;bubble.position.set(Math.cos(angle)*r,.18+phase*.7,Math.sin(angle)*r);bubble.material.opacity=(active?.7:.28)*(1-phase*.45);bubble.scale.setScalar(.8+Math.sin(time*.008+i)*.15)}}}
      else if(d.kind==='electricHeater'){const pulse=d.active?.82+.18*Math.sin(time*.009+d.seed):0;d.coil.material.emissiveIntensity=d.active?2.25+pulse*.65:0;d.indicator.material.color.setHex(d.active?0xff6b3c:0x5b2721);d.indicator.scale.setScalar(d.active?.92+pulse*.1:1);d.indicator.scale.z=.36;d.light.intensity=d.active?3.2+pulse*.9:0}
      else if(d.kind==='bathWater'){const pulse=Math.sin(time*.0043)*.5+Math.sin(time*.0071+1.2)*.5;d.surface.position.y=d.baseY+pulse*.006;d.surface.material.opacity=.55+Math.sin(time*.0037)*.035;d.indicator.material.color.setHex(d.active?0xff7b3d:0x41d38b);d.indicator.scale.setScalar(d.active?.96+.08*Math.sin(time*.01):1);d.indicator.scale.z=.32;d.light.intensity=d.active?2.2+.45*Math.sin(time*.008):.2}
      else if(d.kind==='coolantSleeve'){d.mesh.material.opacity=.07+this.coolantVisualLevel*(.17+Math.sin(time*.004)*.018)}
      else if(d.kind==='translucencyFlow'){const active=d.source==='coolant'?this.coolantVisualLevel:!!state.burner&&!!state.coolingWater&&!state.complete&&(state.progress||0)>d.onset;d.uniforms.uTime.value=time*.001;d.uniforms.uActive.value=d.source==='coolant'?active:THREE.MathUtils.lerp(d.uniforms.uActive.value,active?1:0,.14)}
      else if(d.kind==='waterBoiling'){d.group.visible=!!state.burner&&!!state.coolingWater&&!state.complete&&(state.progress||0)>d.onset}
      else if(d.kind==='distillationThermometer'){const q=Math.max(0,Math.min(1,((state.temp||25)-25)/72)),height=THREE.MathUtils.lerp(d.minHeight,d.maxHeight,q);d.column.scale.y=height;d.column.position.y=d.baseY+height/2}
      else if(d.kind==='receiverFill'){const fill=Math.max(0,Math.min(1,((state.progress||0)-.18)/.82)),level=.055+fill*.62,height=Math.max(.08,level*1.08);d.liquid.scale.y=height/d.maxHeight;d.liquid.position.y=.085+height/2;d.meniscus.position.y=.085+height;d.surfaceY=d.groupScale*(.085+height)}
      else if(d.kind==='receiverDrip'){const active=!!state.burner&&!!state.coolingWater&&!state.complete&&(state.progress||0)>.22,q=((state.time||0)*d.speed+d.phase)%1,fallQ=Math.min(1,q/.79),surface=d.fill.surfaceY+.018;d.drop.visible=active&&q<.81;if(d.drop.visible){const eased=fallQ*fallQ;d.drop.position.set(d.start.x+Math.sin(fallQ*Math.PI)*.008,THREE.MathUtils.lerp(d.start.y,surface+.025,eased),d.start.z);d.drop.material.opacity=Math.min(1,fallQ*5)*(1-Math.max(0,(fallQ-.92)/.08))*.9;d.drop.scale.set(.82,1.18+fallQ*.42,.82)}const splashQ=Math.max(0,Math.min(1,(q-.78)/.22)),splashing=active&&q>=.78;d.ring.visible=splashing;d.ring.position.set(1.55,surface,.04);d.ring.scale.setScalar(.45+splashQ*1.65);d.ring.material.opacity=splashing?(1-splashQ)*.68:0;for(let i=0;i<d.splashDrops.length;i++){const splash=d.splashDrops[i],angle=i/d.splashDrops.length*Math.PI*2+.35,radius=.018+splashQ*(.075+(i%2)*.025);splash.visible=splashing;splash.position.set(1.55+Math.cos(angle)*radius,surface+.012+Math.sin(Math.PI*splashQ)*(.055+(i%3)*.014),.04+Math.sin(angle)*radius*.65);splash.scale.setScalar(.72+(1-splashQ)*.48)}d.splashDrops[0].material.opacity=splashing?Math.sin(Math.PI*splashQ)*.88:0}
      else if(d.kind==='titrationIndicator'){const timer=Math.max(0,state.titrationIndicatorTimer||0),active=timer>0,q=active?Math.min(1,timer/d.duration):0,smooth=value=>{value=Math.max(0,Math.min(1,value));return value*value*(3-2*value)};let tilt=0;if(!active){d.group.position.copy(d.start)}else if(q<.34){const move=smooth(q/.34);d.group.position.lerpVectors(d.start,d.pour,move);tilt=1.64*smooth((q-.2)/.14)}else if(q<.72){d.group.position.copy(d.pour);tilt=1.64}else if(q<.84){d.group.position.copy(d.pour);tilt=1.64*(1-smooth((q-.72)/.12))}else{d.group.position.lerpVectors(d.pour,d.start,smooth((q-.84)/.16))}d.group.rotation.z=tilt;d.cap.visible=!active;d.nozzle.visible=active;d.group.updateMatrix();const mouth=new THREE.Vector3(0,1.09,0).applyMatrix4(d.group.matrix),target=new THREE.Vector3(.06,1.585,.1);for(let i=0;i<d.drops.length;i++){const drop=d.drops[i],dropQ=(q-(.44+i*.14))/.105,falling=active&&dropQ>=0&&dropQ<=1;drop.visible=falling;if(falling){const fall=smooth(dropQ);drop.position.lerpVectors(mouth,target,fall);drop.position.x+=Math.sin(dropQ*Math.PI)*(.012*(i?1:-1));drop.material.opacity=Math.sin(Math.PI*Math.min(.999,dropQ))*.92;drop.scale.set(.78,1.34-dropQ*.34,.78)}}}
      else if(d.kind==='titrationSwirl'){const active=state.titrationStage===2&&state.running||(state.titrationDropTimer||0)>0,pulse=active?Math.sin(time*.0085):0;d.group.position.x=d.baseX+pulse*.045;d.group.position.z=d.baseZ+Math.cos(time*.0085)*.018*(active?1:0);d.group.rotation.y=active?Math.sin(time*.0092)*.055:0;d.group.rotation.z=active?pulse*.018:0}
      else if(d.kind==='titrationPinkBurst'){const stream=state.titrationStage===2&&state.running,dropping=(state.titrationDropTimer||0)>0,fallQ=dropping?Math.max(0,Math.min(1,1-state.titrationDropTimer/.42)):0,cycle=stream?((state.time||0)*1.78+.08)%1:1;let active=false,q=0;if(stream&&cycle<.72){active=true;q=cycle/.72}else if(dropping&&fallQ>=.68){active=true;q=Math.min(1,(fallQ-.68)/.32)}const envelope=active?Math.sin(Math.PI*Math.min(.999,q)):0;d.group.visible=active&&!state.complete&&!!state.titrationIndicator;if(d.group.visible){const expansion=.72+q*1.34,wobble=Math.sin(time*.013)*.018;d.group.position.set(wobble*.42,d.surfaceY+.012-q*.026,.015+wobble);d.core.scale.set(expansion,.09+q*.08,.72+q*.82);d.core.rotation.y=time*.0018;d.coreMat.opacity=envelope*(stream?.56:.68);d.ring.scale.setScalar(.62+q*1.9);d.ring.position.y=.012-q*.018;d.ringMat.opacity=(1-q)*envelope*.76;for(let i=0;i<d.wisps.length;i++){const wisp=d.wisps[i],angle=wisp.userData.angle+q*.62*(i%2?1:-1),reach=wisp.userData.reach*(.34+q*1.35);wisp.position.set(Math.cos(angle)*reach,-q*wisp.userData.sink,Math.sin(angle)*reach*.72);wisp.scale.set(1.2+q*1.8,.38+q*.26,.52+q*.5);wisp.rotation.y=-angle+.18*Math.sin(time*.006+i);wisp.material.opacity=envelope*(.38+(i%3)*.06)}}else{d.coreMat.opacity=0;d.ringMat.opacity=0;d.wispMat.opacity=0}}
      else if(d.kind==='titrationFlow'){const reading=Math.max(0,Math.min(50,state.titrationVolume||0)),height=Math.max(.025,d.maxHeight*(1-reading/50)),open=state.titrationStage===2&&state.running,dropping=(state.titrationDropTimer||0)>0;d.liquid.scale.y=height;d.liquid.position.y=d.bottomY+height/2;d.meniscus.position.y=d.bottomY+height;d.flow.visible=open;d.drop.visible=dropping;d.endpointRing.visible=false;if(dropping){const q=Math.max(0,Math.min(1,1-state.titrationDropTimer/.42)),eased=q*q;d.drop.position.set(.06,THREE.MathUtils.lerp(1.62,1.59,eased),THREE.MathUtils.lerp(.04,.095,q));d.drop.material.opacity=Math.sin(Math.PI*Math.min(.999,q))*.94;d.drop.scale.set(.78,1.34-q*.34,.78);if(q>.72){const splashQ=(q-.72)/.28;d.endpointRing.visible=true;d.endpointRing.scale.setScalar(.6+splashQ*1.4);d.endpointRing.material.opacity=(1-splashQ)*.5}}}
      else if(d.kind==='chromatographySolvent'){const q=Math.min(1,state.progress||0),height=.28+q*1.5,frontY=-.66+q*1.5;d.wet.scale.y=height;d.wet.position.y=-1.01+height/2;d.front.position.y=frontY;d.front.material.opacity=q>=.94?.72:0}
      else if(d.kind==='chromatographyInk'){const q=Math.min(1,state.progress||0),fade=Math.max(0,Math.min(1,(q-.03)/.2));d.mesh.material.opacity=.96*(1-fade)}
      else if(d.kind==='chromatographyDye'){const q=Math.min(1,state.progress||0),ease=1-Math.pow(1-q,1.35),frontY=-.66+q*1.5,rawTravel=d.startY+(d.endY-d.startY)*ease,travel=Math.min(rawTravel,frontY-.045),split=Math.max(0,Math.min(1,(q-.03)/.2)),spread=1+Math.sin(q*Math.PI)*.72;d.mesh.position.x=0;d.mesh.position.y=travel;d.mesh.scale.set(1+.2*q,spread,1);d.tail.position.x=0;d.tail.position.y=Math.min(d.startY+(travel-d.startY)*.72,frontY-.07);d.tail.scale.set(1.15,1+q*2.4,1);d.mesh.material.opacity=split*(.86+.1*Math.sin(time*.004+d.phase));d.tail.material.opacity=split*.15}
      else if(d.kind==='thermite'){
        const t=state.complete?8:state.running?Math.max(0,state.thermiteTimer||0):0,clamp=q=>Math.max(0,Math.min(1,q)),smooth=q=>{q=clamp(q);return q*q*(3-2*q)},running=!!state.running;
        const approach=smooth(t/1.1),retreat=smooth((t-2.05)/.65);d.torch.position.lerpVectors(d.torchStart,d.torchTarget,approach);if(retreat>0)d.torch.position.lerpVectors(d.torchTarget,d.torchStart,retreat);d.torch.position.y+=Math.sin(approach*Math.PI)*.05;d.torch.visible=!state.complete&&t<2.72;
        const doorCloseQ=state.complete?1:state.running?smooth((t-2.05)/.65):0;if(d.rightDoor)d.rightDoor.rotation.y=0.9*(1-doorCloseQ);
        const torchActive=running&&t<2.46;d.outerFlame.visible=torchActive;d.innerFlame.visible=torchActive;d.torchLight.intensity=torchActive?1.65+.22*Math.sin(time*.028):0;if(torchActive){const flicker=1+Math.sin(time*.035)*.045;d.outerFlame.scale.set(flicker,1+.035*Math.sin(time*.051),flicker);d.innerFlame.scale.set(1/flicker,1+.026*Math.sin(time*.043),1/flicker)}
        const fuseQ=clamp((t-1.1)/1.5),remainingFuse=1-fuseQ,fuseBurning=running&&t>=1.1&&t<2.64,emberPoint=d.fuseCurve.getPoint(remainingFuse);d.fuseEmber.visible=fuseBurning;d.fuseEmber.position.copy(emberPoint);d.fuseEmber.material.opacity=fuseBurning?.9:0;d.fuseEmber.scale.setScalar(.8+.28*Math.sin(time*.042));d.fuseLight.position.copy(emberPoint);d.fuseLight.intensity=fuseBurning?2.8+.65*Math.sin(time*.031):0;
        for(const segment of d.fuseSegments){const distance=remainingFuse-segment.userData.mid,atFront=fuseBurning&&distance>=0&&distance<.075;segment.visible=segment.userData.mid<=remainingFuse+.008;segment.material.emissive.setHex(atFront?0x9a2d00:0x191919);segment.material.emissiveIntensity=atFront?1.55:0;segment.material.transparent=atFront;segment.material.opacity=atFront?clamp(distance/.075)*.78+.2:1}
        const powderFade=1-smooth((t-2.58)/.62);for(const grain of d.mgoPowder){const threshold=1-grain.u,age=fuseQ-threshold,visible=age>=0&&powderFade>.01&&running;grain.mesh.visible=visible;if(visible){const source=d.fuseCurve.getPoint(grain.u),scatter=clamp(age/.2),settle=smooth((age-.06)/.48),floorY=grain.u<.3?1.515:1.155,lift=Math.sin(Math.PI*clamp(age/.32))*(.045+(grain.u%5)*.008);grain.mesh.position.set(source.x+Math.cos(grain.angle)*grain.spread*scatter,THREE.MathUtils.lerp(source.y+lift,floorY,settle),source.z+Math.sin(grain.angle)*grain.spread*scatter*.72);grain.mesh.rotation.set(grain.angle+time*.002,grain.angle*.7+time*.0015,time*.001);grain.mesh.scale.setScalar(grain.scale*powderFade*(.78+.18*Math.sin(time*.008+grain.angle)))}}
        for(let i=0;i<d.mgoPuffs.length;i++){const puff=d.mgoPuffs[i],q=(fuseQ*5.4+i*.173)%1;puff.visible=fuseBurning;puff.position.set(emberPoint.x+Math.cos(i*2.399)*(.018+q*.13),emberPoint.y+.02+q*.14,emberPoint.z+Math.sin(i*2.399)*(.018+q*.095));puff.material.opacity=fuseBurning?(1-q)*(.12+(i%3)*.055):0;puff.scale.setScalar(.55+q*1.7)}
        for(let i=0;i<d.fuseSparks.length;i++){const spark=d.fuseSparks[i],q=(time*.001*(1.2+(i%5)*.13)+i*.137)%1;spark.visible=fuseBurning;spark.position.set(emberPoint.x+Math.cos(i*2.399)*(.02+q*.16),emberPoint.y+.02+q*.2-q*q*.13,emberPoint.z+Math.sin(i*2.399)*(.02+q*.12));spark.material.opacity=fuseBurning?(1-q)*.9:0;spark.scale.setScalar(.5+(1-q)*.8)}
        const flashAge=t-2.6,flashActive=running&&flashAge>=0&&flashAge<1.08,flashEnvelope=flashActive?Math.exp(-flashAge*3.25):0,fountain=running&&t>=2.62&&t<6.65,fountainIn=smooth((t-2.62)/.36),fountainOut=1-smooth((t-5.55)/1.1),fountainLevel=fountain?fountainIn*fountainOut:0;
        d.flashCore.visible=flashActive;d.corona.visible=flashActive;d.fireColumn.visible=fountain;d.flashCore.material.opacity=flashActive?.95*flashEnvelope:0;d.corona.material.opacity=flashActive?.7*flashEnvelope:0;d.flashCore.scale.setScalar(.45+2.8*(1-flashEnvelope)+flashEnvelope*.7);d.corona.scale.set(1.1+flashAge*1.6,.78+flashAge*2.2,1.1+flashAge*1.6);d.fireColumn.material.opacity=.055+.14*fountainLevel;d.fireColumn.scale.set(.54+.22*Math.sin(time*.029),.32+fountainLevel*(.78+.1*Math.sin(time*.041)),.54+.19*Math.sin(time*.033+1));d.flashLight.intensity=flashActive?38*flashEnvelope:fountain?6.5*fountainLevel:state.complete?.65:0;
        d.shockwaves.forEach((wave,i)=>{const q=clamp((flashAge-i*.12)/.58),visible=flashActive&&flashAge>=i*.12;wave.visible=visible;wave.scale.setScalar(.7+q*7.5);wave.material.opacity=visible?(1-q)*(.72-i*.14):0});
        const local=t-2.62;d.sparkMesh.visible=fountain;for(let i=0;i<d.sparkData.length;i++){const s=d.sparkData[i],elapsed=local-s.delay;let scale=0,x=0,y=1.54,z=0,velocity=new THREE.Vector3(0,1,0);if(fountain&&elapsed>=0){const cycle=Math.floor(elapsed/s.life),age=elapsed-cycle*s.life,q=age/s.life,angle=s.angle+cycle*.37,speed=s.speed*(s.heavy?.62:1),vy=s.vy*(s.heavy?.62:1);x=Math.cos(angle)*(.05+speed*age);z=Math.sin(angle)*(.04+speed*age*.78);y=1.54+vy*age-(s.heavy?2.7:2.2)*age*age;if(y>.18){scale=(1-q)*(.86+(i%5)*.16)*fountainLevel;velocity.set(Math.cos(angle)*speed,vy-(s.heavy?5.4:4.4)*age,Math.sin(angle)*speed*.78)}}d.dummy.position.set(x,y,z);d.dummy.scale.set(scale,scale*(1.15+(i%3)*.38),scale);d.dummy.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),velocity.normalize());d.dummy.rotation.y+=s.spin;d.dummy.updateMatrix();d.sparkMesh.setMatrixAt(i,d.dummy.matrix)}if(d.sparkMesh.visible)d.sparkMesh.instanceMatrix.needsUpdate=true;
        for(let i=0;i<d.nearSparks.length;i++){const trail=d.nearSparks[i],s=d.sparkData[i*3],elapsed=local-s.delay*.55;trail.visible=fountain&&elapsed>=0;if(trail.visible){const cycle=Math.floor(elapsed/s.life),age=elapsed-cycle*s.life,q=age/s.life,angle=s.angle+cycle*.41,speed=s.speed*.86,vy=s.vy*.92,y=1.56+vy*age-2.35*age*age,velocity=new THREE.Vector3(Math.cos(angle)*speed,vy-4.7*age,Math.sin(angle)*speed*.72);trail.position.set(Math.cos(angle)*(.05+speed*age),y,Math.sin(angle)*(.04+speed*age*.72));trail.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),velocity.normalize());trail.scale.setScalar((1-q)*(.72+(i%4)*.13)*fountainLevel);trail.material.opacity=.55+.43*(1-q)}}
        const ironVisible=t>=3.02||state.complete,ironQ=state.complete?1:smooth((t-3.02)/.92),ironPulse=running&&fountain?1+.025*Math.sin(time*.018):1;d.ironBlob.visible=ironVisible;d.ironBlob.scale.set((.12+.8*ironQ)*ironPulse,(.05+.29*ironQ)*(1+.014*Math.sin(time*.022)),(.1+.69*ironQ)/ironPulse);let ironGlow=0;if(ironVisible&&!state.complete){const coolQ=smooth((t-5.9)/2.1);ironGlow=fountain?.82+.13*Math.sin(time*.021):.22+.6*(1-coolQ);d.ironBlob.material.color.setHex(0xff6f19).lerp(new THREE.Color(0xa43f24),coolQ);d.ironBlob.material.emissive.setHex(0xff2600).lerp(new THREE.Color(0x6f170b),coolQ);d.ironBlob.material.roughness=.2+.16*coolQ;d.afterglowStart=0}else if(state.complete){if(!d.afterglowStart)d.afterglowStart=time;const afterQ=clamp((time-d.afterglowStart)/4600),fade=1-smooth(afterQ);ironGlow=.24*fade;d.ironBlob.material.color.setHex(0xa13e24).lerp(new THREE.Color(0x3c3430),afterQ);d.ironBlob.material.emissive.setHex(0x8d210e).lerp(new THREE.Color(0x160604),afterQ);d.ironBlob.material.roughness=.36+.22*afterQ;this.thermiteAfterglowUntil=d.afterglowStart+4650}d.ironBlob.material.emissiveIntensity=.055+ironGlow*3.15;d.ironGlowLight.intensity=ironGlow*7.4;this.thermiteGlowFraction=ironGlow;
        for(const puff of d.smoke){const age=t-4.45-puff.delay,active=running&&!state.complete&&age>=0&&age<2.6;puff.mesh.visible=active;if(active){const q=clamp(age/2.6),fade=(1-q)*(1-q),r=.14+puff.drift*age;puff.mesh.position.set(Math.cos(puff.angle)*r,1.72+puff.speed*age,Math.sin(puff.angle)*r-.08);puff.mesh.scale.setScalar(.45+q*1.9);puff.mesh.material.opacity=fade*(.18+.16*(1-fountainLevel))}else{puff.mesh.material.opacity=0}}
        for(const mote of d.sandDust){const age=t-2.64-mote.delay,active=running&&age>=0&&age<1.35;mote.mesh.visible=active;if(active){const q=age/1.35,r=.18+mote.speed*age*2.2;mote.mesh.position.set(Math.cos(mote.angle)*r,1.14+Math.sin(Math.PI*q)*(.28+(mote.delay%3)*.08),Math.sin(mote.angle)*r);mote.mesh.material.opacity=(1-q)*.62;mote.mesh.rotation.set(time*.004+mote.angle,time*.003,0)}}
        d.shieldGlow.material.opacity=flashActive?.18+flashEnvelope*.42:fountain?.06+.12*fountainLevel:0;
        if(running&&t>2.58&&t<4.2){const amp=.055*(1-smooth((t-2.58)/1.62));this.camera.position.x+=Math.sin(time*.071)*amp;this.camera.position.y+=Math.sin(time*.093+1)*amp*.42;this.camera.position.z+=Math.sin(time*.057+2)*amp*.34;this.camera.lookAt(0,1.05,0)}
      }
      else if(d.kind==='magnesiumBurn'){const pulse=1+Math.sin(time*.024+d.seed)*.16+Math.sin(time*.057+d.seed)*.06;d.core.scale.set(pulse,.48*pulse,pulse);d.corona.scale.set(1.05*pulse,.62*pulse,1.05*pulse);d.light.intensity=10+Math.sin(time*.031+d.seed)*2.2;for(const spark of d.sparks){const q=(time*.001*spark.userData.speed+spark.userData.phase)%1,r=.06+q*.28;spark.position.set(Math.cos(spark.userData.angle)*r,.37+q*.72,Math.sin(spark.userData.angle)*r);spark.material.opacity=.95*(1-q);spark.scale.setScalar(.65+(1-q)*.8)}}
    }
    this.renderer.render(this.scene,this.camera)
  }
  get isTransitioning(){return Math.abs(this.coolantVisualLevel-this.coolantTransitionTarget)>.01||performance.now()<this.thermiteAfterglowUntil}
  get info(){return {enabled:this.available,renderer:this.available?'WebGL / Three.js':'unavailable',objects:this.root?.children.length||0}}
}
