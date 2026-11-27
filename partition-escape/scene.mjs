import * as THREE from './vendor/three.module.min.js';
export class RoomScene {
  constructor(container,onSelect){
    this.el=container;this.onSelect=onSelect;this.items=new Map();this.mode='cut';this.selected=null;this.view=null;this.seams=[];this.powerLights=[];this.pulseUntil=0;
    try{this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});}
    catch{container.classList.add('no-webgl');container.insertAdjacentHTML('afterbegin','<p class="fallback">此设备无法启用 WebGL。下方物件按钮仍可完成整关。</p>');return;}
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,2));this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.6;
    container.prepend(this.renderer.domElement);this.renderer.domElement.setAttribute('aria-hidden','true');
    this.scene=new THREE.Scene();this.scene.fog=new THREE.Fog('#12181b',28,55);
    this.camera=new THREE.PerspectiveCamera(35,1,.1,80);this.camera.position.set(8,7.5,10);this.camera.lookAt(0,.6,0);
    this.scene.add(new THREE.HemisphereLight('#d9eef0','#1c2024',2.7));
    const key=new THREE.DirectionalLight('#ffdfb0',4);key.position.set(2,8,5);key.castShadow=true;key.shadow.mapSize.set(1024,1024);key.shadow.camera.left=-10;key.shadow.camera.right=10;key.shadow.camera.top=9;key.shadow.camera.bottom=-9;key.shadow.normalBias=.03;this.scene.add(key);
    this.group=new THREE.Group();this.scene.add(this.group);this.ray=new THREE.Raycaster();this.pointer=new THREE.Vector2();
    const target=e=>{const r=this.renderer.domElement.getBoundingClientRect();this.pointer.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);this.ray.setFromCamera(this.pointer,this.camera);return this.ray.intersectObjects([...this.items.values()].map(o=>o.group),true).map(h=>{if(!h.object.visible)return;let n=h.object;while(n&&!n.userData.id)n=n.parent;return n?.userData.id;}).find(Boolean);};
    this.renderer.domElement.addEventListener('pointermove',e=>{const id=target(e);this.renderer.domElement.style.cursor=id?'pointer':'default';this.highlight(id||this.selected);});
    this.renderer.domElement.addEventListener('click',e=>{const id=target(e);if(id)this.onSelect(id);});
    this.resize=new ResizeObserver(()=>{const w=container.clientWidth,h=container.clientHeight;this.renderer.setSize(w,h);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();});this.resize.observe(container);
    this.reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.tick=()=>{this.anim=requestAnimationFrame(this.tick);if(this.fan&&!this.reduced&&this.view?.local?.fanSpinning&&!this.view.paused)this.fan.rotation.z+=.025;for(const seam of this.seams)seam.material.emissiveIntensity=performance.now()<this.pulseUntil&&!this.view?.paused?4:2;this.renderer.render(this.scene,this.camera);};this.tick();
  }
  material(color,metalness=.2,roughness=.65){return new THREE.MeshStandardMaterial({color,metalness,roughness});}
  box(parent,w,h,d,x,y,z,color){const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),this.material(color));mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;}
  cylinder(parent,r,h,x,y,z,color){const m=new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,24),this.material(color,.6));m.position.set(x,y,z);m.castShadow=true;parent.add(m);return m;}
  shell(parent,seat){
    const warm=seat==='west', accent=warm?'#e3aa62':'#5bb9c0';
    this.box(parent,6.3,.3,6.5,0,-.16,0,'#293238');
    for(let x=-2.5;x<3;x++)for(let z=-2.5;z<3;z++)this.box(parent,.96,.015,.96,x,0,z,(Math.floor(x+z)%2)?'#333e43':'#303a40');
    this.box(parent,6.3,3.5,.25,0,1.65,-3.15,'#344047');
    const side=warm?3.15:-3.15;
    this.box(parent,.25,3.5,6.3,side,1.65,0,'#28343a');
    this.box(parent,6.4,.16,.4,0,3.4,-3.1,'#161d21');
    for(const x of [-2.9,2.9])this.box(parent,.14,3.4,.3,x,1.6,-2.95,'#192329');
    const strip=this.box(parent,5.5,.035,.06,0,2.9,-2.96,accent);strip.material.emissive.set(accent);strip.material.emissiveIntensity=2;
    const seam=this.box(parent,.035,2.8,.05,side-(warm?.14:-.14),1.5,1.8,accent);seam.material.emissive.set(accent);seam.material.emissiveIntensity=2;this.seams.push(seam);
    const light=new THREE.PointLight(accent,26,12);light.position.set(warm?-1:1,2,1);parent.add(light);this.powerLights.push(light);
    // Architectural decoration carries no puzzle information.
    this.box(parent,.13,2.4,.13,-2.7,1.2,-2.85,'#56636a');
    this.box(parent,1.1,.13,.13,-2.2,2.4,-2.85,'#56636a');
    return accent;
  }
  build(view){
    if(!this.renderer)return;
    this.group.traverse(n=>{if(n.geometry)n.geometry.dispose();if(n.material)n.material.dispose();});this.group.clear();this.items.clear();this.fan=null;this.gate=null;this.door=null;this.seams=[];this.powerLights=[];
    if(view.role==='watch'){
      for(const seat of ['west','east']){
        const g=new THREE.Group();g.position.x=seat==='west'?-3.3:3.3;this.group.add(g);const color=this.shell(g,seat);
        // Only public exit geometry. No tools, inventory, plaques or private coordinates.
        for(const x of [-.86,.86])this.box(g,.16,2.7,.35,x,1.35,-2.9,'#637078');
        this.box(g,1.88,.18,.35,0,2.72,-2.9,'#637078');
        const panel=new THREE.Group();panel.position.set(seat==='west'?-.76:0,0,-2.9);g.add(panel);
        if(seat==='west'){
          this.box(panel,1.52,2.5,.18,.76,1.26,0,'#26373e');
          this.box(panel,.09,.4,.12,1.28,1.2,.15,color);this.door=panel;
        }else{
          this.box(panel,1.52,.18,.18,0,2.4,0,color);
          for(const x of [-.6,-.3,0,.3,.6])this.box(panel,.08,2.3,.14,x,1.2,0,color);
          this.gate=panel;
        }
        this.cylinder(g,.22,.8,0,.4,.2,color);this.cylinder(g,.18,.3,0,1,.2,color);
      }
      this.setCamera(this.mode);return;
    }
    this.camera.position.set(view.role==='west'?-8:8,7.2,10);this.camera.lookAt(0,.6,0);
    const accent=this.shell(this.group,view.role);
    for(const p of view.scene){
      const g=new THREE.Group();g.position.set(...p.position);g.userData.id=p.id;this.group.add(g);this.items.set(p.id,{group:g,kind:p.kind});
      if(p.kind==='console'){
        this.box(g,1.2,.9,.8,0,0,0,'#3f4747');this.box(g,.9,.08,.65,0,.5,0,'#171f24');
        this.cylinder(g,.2,.12,0,.58,0,accent);this.switch=this.box(g,.1,.5,.1,.32,.5,0,'#d8c3a3');
      }else if(p.kind==='door'||p.kind==='gate'){
        for(const x of [-.86,.86])this.box(g,.16,2.7,.35,x,1.35,0,'#637078');
        this.box(g,1.88,.18,.35,0,2.72,0,'#637078');
        const panel=new THREE.Group();g.add(panel);this.box(panel,1.52,2.5,.16,0,1.26,0,'#203239');
        for(let y=.35;y<2.5;y+=.35)this.box(panel,1.4,.08,.07,0,y,.12,accent);
        if(p.kind==='gate'){this.gate=panel;this.brace=this.box(g,.2,1.35,.25,.65,.67,.35,'#b88d5c');this.brace.visible=false;}else this.door=panel;
      }else if(p.kind==='plaque'){
        this.box(g,.88,.62,.08,0,0,0,'#bd9c64');
        for(let y=-.18;y<=.18;y+=.12)this.box(g,.58,.025,.025,0,y,.05,'#463e30');
      }else if(p.kind==='fan'){
        this.box(g,1.4,1.35,.2,0,0,0,'#151f25');
        const rotor=new THREE.Group();rotor.position.z=.16;g.add(rotor);this.fan=rotor;
        for(let i=0;i<4;i++){const blade=this.box(rotor,.18,.9,.04,0,0,0,'#779299');blade.rotation.z=i*Math.PI/4;}
        const ring=new THREE.Mesh(new THREE.TorusGeometry(.54,.055,8,40),this.material(accent));ring.position.z=.25;g.add(ring);
        this.storedBrace=this.box(g,1.05,.15,.18,0,-.8,.05,'#b88d5c');this.storedBrace.visible=false;
      }else if(p.kind==='lever'){
        this.box(g,.6,1,.6,0,0,0,'#3d4c51');this.lever=this.box(g,.12,.75,.12,0,.65,0,'#d9d4c5');this.box(g,.5,.15,.18,0,1.05,0,accent);
      }else{
        this.box(g,.15,.9,.95,0,0,0,'#8b8170');this.box(g,.2,.35,.65,0,0,.04,'#1a252b');
        this.key=this.box(g,.35,.06,.1,view.role==='west'?-.25:.25,-.12,.1,'#efc76d');
        if(view.role==='west')this.key.userData.id='door';
      }
      const ring=new THREE.Mesh(new THREE.TorusGeometry(.33,.025,6,32),new THREE.MeshBasicMaterial({color:accent,transparent:true,opacity:.5}));ring.rotation.x=-Math.PI/2;ring.position.y=-p.position[1]+.04;g.add(ring);
    }
  }
  update(view){
    const rebuild=!this.view||this.view.role!==view.role;this.view=view;if(rebuild)this.build(view);
    const visible=view.role==='watch'?view.public:view.local;
    if(this.gate)this.gate.position.y=visible.gateOpen?1.7:0;
    if(this.door)this.door.rotation.y=visible.doorOpen?-1.15:0;
    if(view.role==='watch')for(const light of this.powerLights)light.intensity=visible.power?38:14;
    if(this.brace)this.brace.visible=!!view.local?.braced;
    if(this.storedBrace)this.storedBrace.visible=!!view.local?.braceSeen&&!view.local?.braced;
    if(this.key)this.key.visible=!!view.local?.keyHere&&!view.local?.unlocked;
    if(this.switch)this.switch.rotation.z=view.local?.power?-.55:.25;
    if(this.lever)this.lever.rotation.z=view.local?.holdingBrake?-.4:0;
    this.highlight(this.selected);
  }
  pulse(){if(!this.reduced)this.pulseUntil=performance.now()+900;}
  highlight(id){this.selected=id;for(const [key,o] of this.items)o.group.traverse(n=>{if(n.isMesh&&n.material.emissive){n.material.emissive.set(key===id?'#62513c':'#000000');n.material.emissiveIntensity=.35;}});}
  setCamera(mode){this.mode=mode;if(!this.renderer)return;if(mode==='west'){this.camera.position.set(-1,7,12);this.camera.lookAt(-3.3,.7,0);}else if(mode==='east'){this.camera.position.set(8,7,12);this.camera.lookAt(3.3,.7,0);}else{this.camera.position.set(12,14,19);this.camera.lookAt(0,.4,0);}}
  dispose(){cancelAnimationFrame(this.anim);this.resize?.disconnect();this.renderer?.dispose();}
}
