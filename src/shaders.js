/* ARC / LTC LIGHT LAB — custom multi-polygon lighting.
 * Constant-emitter integration follows Heitz et al. 2016 §5.1.
 * Textured illumination is an explicitly approximate normalized Gaussian filter
 * evaluated via the cosine-space orthogonal projection (§§5.2–5.4).
 */
const MAX_LIGHTS=5, MAX_VERTS=12, ATLAS_TILE=128, ATLAS_LEVELS=8;
const vertexShader=`
varying vec3 vWorld,vNormal; varying vec2 vUV;
void main(){vec3 localNormal=normal;vec4 localPosition=vec4(position,1.);
#ifdef USE_INSTANCING
localPosition=instanceMatrix*localPosition;localNormal=transpose(inverse(mat3(instanceMatrix)))*localNormal;
#endif
vec4 p=modelMatrix*localPosition;vWorld=p.xyz;vUV=uv;
vNormal=normalize(transpose(mat3(viewMatrix))*normalMatrix*localNormal);
gl_Position=projectionMatrix*viewMatrix*p;}`;
const lightDeclarations=`
precision highp float;precision highp int;
#define ML 5
#define MV 12
#define MT 10
const float PI=3.141592653589793;
struct AreaLight {
 vec3 center,U,V,N,radiance;
 vec2 size;
 float area,twoSided,phase,reach,paintMotion;
 int count,triCount,pattern;
 vec4 impact;
 vec2 poly[MV];
 vec4 tris[MT];
};
uniform AreaLight uLights[ML];
uniform sampler2D uRaw,uFiltered,uMean,uUserEmission;
vec3 lightVertex(AreaLight l,int i){return l.center+l.U*l.poly[i].x+l.V*l.poly[i].y;}
bool lightFaces(AreaLight l,vec3 P){return l.twoSided>.5||dot(l.N,P-l.center)>0.;}
bool insidePolygon(AreaLight l,vec2 p){
 bool c=false;
 for(int i=0;i<MV;i++){if(i>=l.count)break;int j=i==0?l.count-1:i-1;vec2 a=l.poly[i],b=l.poly[j];
 if((a.y>p.y)!=(b.y>p.y)){float x=(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x;if(p.x<x)c=!c;}}
 return c;
}
vec3 rawEmission(int id,vec2 uv){
 // Half-texel inset stops neighboring emitter tiles bleeding into one another.
 vec2 p=clamp(uv,vec2(.5/128.),vec2(1.-.5/128.));
 return texture2D(uRaw,vec2(p.x,(float(id)+p.y)/5.)).rgb;
}
float filterSigma(int level){
 if(level==0)return .0025;if(level==1)return .012;if(level==2)return .035;
 if(level==3)return .085;if(level==4)return .19;if(level==5)return .42;
 if(level==6)return .9;return 2.;
}
vec3 filteredTap(int id,int level,vec2 uv){
 if(level==7)return texture2D(uMean,vec2(.5,(float(id)+.5)/5.)).rgb;
 vec2 p=clamp((uv+.5)*.5,vec2(.5/128.),vec2(1.-.5/128.));
 return texture2D(uFiltered,vec2((float(level)+p.x)/8.,(float(id)+p.y)/5.)).rgb;
}
vec3 emissionFilter(int id,AreaLight l,mat3 A,vec3 P){
 // Transform the whole emitter plane; project the shading point orthogonally.
 vec3 C=A*(l.center-P),U=A*(l.U*l.size.x),V=A*(l.V*l.size.y);
 vec3 n=cross(U,V);float n2=max(dot(n,n),1e-20);
 vec3 p=n*(dot(C,n)/n2),d=p-C;
 float uu=dot(U,U),uv=dot(U,V),vv=dot(V,V),det=max(uu*vv-uv*uv,1e-20);
 vec2 tex=vec2(dot(d,U)*vv-dot(d,V)*uv,dot(d,V)*uu-dot(d,U)*uv)/det+.5;
 float transformedArea=l.area*sqrt(n2)/max(l.size.x*l.size.y,1e-10);
 float sigma=sqrt(dot(p,p)/max(2.*transformedArea,1e-12));
 int level=0;
 for(int i=0;i<7;i++){if(sigma>=filterSigma(i+1))level=i+1;}
 if(level==7)return filteredTap(id,7,tex);
 float k=clamp((log(max(sigma,.0001))-log(filterSigma(level)))/(log(filterSigma(level+1))-log(filterSigma(level))),0.,1.);
 return mix(filteredTap(id,level,tex),filteredTap(id,level+1,tex),k);
}
`;
const commonShader=lightDeclarations+`
uniform sampler2D uLUT1,uLUT2,uPaintColor,uPaintProps;
uniform vec3 uBase;
uniform float uRoughness,uMetalness,uFill;
uniform int uPattern,uPaintEnabled,uSurfaceView,uLightMask,uBounded;
uniform int uShadowOn,uShadowLight,uReferenceModel;
uniform vec3 uBlockCenter;
uniform vec2 uBlockSize;
uniform float uBlockAngle;
float lightFade(AreaLight l,vec3 P){if(uBounded==0)return 1.;float d=distance(P,l.center);return 1.-smoothstep(l.reach*.78,l.reach,d);}
varying vec3 vWorld,vNormal;varying vec2 vUV;
vec4 lookup(sampler2D tex,vec2 p){
 vec2 z=clamp(p,0.,1.)*63.;ivec2 a=ivec2(floor(z)),b=min(a+ivec2(1),ivec2(63));vec2 f=fract(z);
 return mix(mix(texelFetch(tex,a,0),texelFetch(tex,ivec2(b.x,a.y),0),f.x),mix(texelFetch(tex,ivec2(a.x,b.y),0),texelFetch(tex,b,0),f.x),f.y);
}
mat3 localFrame(vec3 N,vec3 V){vec3 T=V-N*dot(N,V);if(dot(T,T)<1e-8)T=abs(N.y)<.99?cross(vec3(0,1,0),N):cross(vec3(1,0,0),N);T=normalize(T);return transpose(mat3(T,cross(N,T),N));}
mat3 getMinv(vec3 N,vec3 V,float r,out vec2 amplitude){
 vec2 p=vec2(r,sqrt(max(0.,1.-clamp(dot(N,V),0.,1.))));vec4 m=lookup(uLUT1,p);amplitude=lookup(uLUT2,p).xy;
 return mat3(m.x,0,m.y,0,1,0,m.z,0,m.w);
}
float polygonIntegral(AreaLight l,mat3 A,vec3 P){
 vec3 q[24];int n=0;
 for(int i=0;i<MV;i++){if(i>=l.count)break;int j=i==0?l.count-1:i-1;
 vec3 a=A*(lightVertex(l,j)-P),b=A*(lightVertex(l,i)-P);bool ia=a.z>0.,ib=b.z>0.;
 if(ia!=ib)q[n++]=mix(a,b,clamp(a.z/(a.z-b.z),0.,1.));if(ib)q[n++]=b;}
 if(n<3)return 0.;float sum=0.;
 for(int i=0;i<24;i++){if(i>=n)break;int j=i+1==n?0:i+1;
 vec3 a=q[i]/max(length(q[i]),1e-10),b=q[j]/max(length(q[j]),1e-10),c=cross(a,b);
 float sn=length(c);if(sn>1e-8)sum+=atan(sn,clamp(dot(a,b),-1.,1.))*c.z/sn;}
 return clamp(abs(sum)/(2.*PI),0.,1.);
}
// One planar convex blocker beneath a horizontal rectangular emitter. The
// occluded domain is the emitter intersected with the blocker's angular cone.
// Subtract its LTC integral; the sampled reference tests individual rays instead.
bool shadowApplies(int id,AreaLight l,vec3 P){
 return uShadowOn==1&&id==uShadowLight&&l.count==4&&l.pattern==0&&abs(l.N.y)>.9999
  &&P.y<uBlockCenter.y-.0001&&l.center.y>uBlockCenter.y+.0001;
}
vec3 blockerVertex(int i){
 vec2 corner=i==0?vec2(-.5,-.5):i==1?vec2(.5,-.5):i==2?vec2(.5,.5):vec2(-.5,.5);
 vec2 p=corner*uBlockSize;float c=cos(uBlockAngle),s=sin(uBlockAngle);
 return uBlockCenter+vec3(c*p.x-s*p.y,0.,s*p.x+c*p.y);
}
float blockedIntegral(AreaLight l,mat3 A,vec3 P){
 // At the blocker plane, the projected light is a scaled rectangle. Reject
 // separated bounds and accept full coverage before the exact penumbra clip.
 float t=(uBlockCenter.y-P.y)/(l.center.y-P.y),c=cos(uBlockAngle),s=sin(uBlockAngle);
 vec3 d=mix(P,l.center,t)-uBlockCenter;
 vec2 center=vec2(c*d.x+s*d.z,-s*d.x+c*d.z);
 vec2 U=vec2(c*l.U.x+s*l.U.z,-s*l.U.x+c*l.U.z),V=vec2(c*l.V.x+s*l.V.z,-s*l.V.x+c*l.V.z);
 vec2 extent=(abs(U)*l.size.x+abs(V)*l.size.y)*(.5*t),halfBlock=uBlockSize*.5;
 if(any(greaterThan(abs(center),halfBlock+extent)))return 0.;
 if(all(lessThanEqual(abs(center)+extent,halfBlock)))return polygonIntegral(l,A,P);
 // Rectangle intersection has at most eight vertices; horizon clipping adds one.
 vec3 q[10],tmp[10];int n=4;
 for(int i=0;i<4;i++)q[i]=lightVertex(l,i);
 for(int k=0;k<4;k++){
  vec3 a=blockerVertex(k)-P,b=blockerVertex((k+1)%4)-P;
  vec3 plane=cross(a,b);if(dot(plane,uBlockCenter-P)<0.)plane=-plane;
  int count=0;
  for(int i=0;i<10;i++){if(i>=n)break;int j=i==0?n-1:i-1;
   vec3 start=q[j],end=q[i];float da=dot(plane,start-P),db=dot(plane,end-P);
   if((da>=0.)!=(db>=0.))tmp[count++]=mix(start,end,clamp(da/(da-db),0.,1.));
   if(db>=0.)tmp[count++]=end;
  }
  n=count;if(n<3)return 0.;for(int i=0;i<10;i++){if(i>=n)break;q[i]=tmp[i];}
 }
 int count=0;
 for(int i=0;i<10;i++){if(i>=n)break;int j=i==0?n-1:i-1;
  vec3 a=A*(q[j]-P),b=A*(q[i]-P);if((a.z>0.)!=(b.z>0.))tmp[count++]=mix(a,b,clamp(a.z/(a.z-b.z),0.,1.));
  if(b.z>0.)tmp[count++]=b;
 }
 if(count<3)return 0.;float sum=0.;
 for(int i=0;i<10;i++){if(i>=count)break;int j=i+1==count?0:i+1;
  vec3 a=normalize(tmp[i]),b=normalize(tmp[j]),cr=cross(a,b);float sn=length(cr);
  if(sn>1e-8)sum+=atan(sn,clamp(dot(a,b),-1.,1.))*cr.z/sn;
 }
 return clamp(abs(sum)/(2.*PI),0.,1.);
}
float visibleIntegral(int id,AreaLight l,mat3 A,vec3 P){
 float whole=polygonIntegral(l,A,P);return shadowApplies(id,l,P)?max(0.,whole-blockedIntegral(l,A,P)):whole;
}
bool rayBlocked(int id,AreaLight l,vec3 P,vec3 target){
 if(!shadowApplies(id,l,P))return false;
 float t=(uBlockCenter.y-P.y)/(target.y-P.y);
 if(t<=.00001||t>=.99999)return false;
 vec3 q=mix(P,target,t)-uBlockCenter;float c=cos(uBlockAngle),s=sin(uBlockAngle);
 vec2 local=vec2(c*q.x+s*q.z,-s*q.x+c*q.z);
 return all(lessThanEqual(abs(local),uBlockSize*.5));
}
vec3 toLinear(vec3 c){return mix(pow((c+.055)/1.055,vec3(2.4)),c/12.92,lessThanEqual(c,vec3(.04045)));}
void surfaceParams(out vec3 base,out float rough,out float metal){
 base=uBase;rough=uRoughness;metal=uMetalness;
 if(uPaintEnabled==1){vec4 p=texture2D(uPaintProps,vUV),c=texture2D(uPaintColor,vUV);
 base=mix(base,toLinear(c.rgb),c.a);rough=mix(rough,p.r,p.a);metal=mix(metal,p.g,p.a);}
 if(uPattern==1){vec2 grid=abs(fract(vWorld.xz*.5-.5)-.5)/max(fwidth(vWorld.xz*.5),vec2(.0001));
 float seam=1.-min(min(grid.x,grid.y),1.);base*=1.-.4*seam;
 float scuff=.985+.015*sin(vWorld.x*68.+sin(vWorld.z*71.));base*=scuff;}
 if(uPattern==2){float rib=.5+.5*sin(vWorld.y*115.);base*=.82+.18*rib;}
 rough=clamp(rough,.04,1.);metal=clamp(metal,0.,1.);
}
vec3 ambient(vec3 b,vec3 N){return b*uFill*(.28+.72*max(.1,N.y*.5+.5));}
float ggxD(float n,float a){float a2=a*a,d=1.-n*n+a2*n*n;return a2/(PI*d*d);}
float lambdaGGX(float nz,float a){return .5*(sqrt(1.+a*a*max(0.,1.-nz*nz)/max(nz*nz,1e-10))-1.);}
vec3 ggxCos(vec3 V,vec3 L,float alpha,vec3 F0,out float pdf){
 pdf=0.;if(L.z<=0.||V.z<=0.)return vec3(0);vec3 H=normalize(V+L);float vh=max(dot(V,H),0.),nh=max(H.z,0.);
 float D=ggxD(nh,alpha);pdf=D*nh/max(4.*vh,1e-9);float G=1./(1.+lambdaGGX(V.z,alpha)+lambdaGGX(L.z,alpha));
 return (F0+(1.-F0)*pow(1.-vh,5.))*(D*G/max(4.*V.z,1e-8));
}
`;
const ltcFragment=commonShader+`
void main(){
 vec3 N=normalize(vNormal),V=normalize(cameraPosition-vWorld);if(dot(N,V)<0.)N=-N;
 vec3 base;float rough,metal;surfaceParams(base,rough,metal);
 if(uSurfaceView>0){float value=uSurfaceView==1?rough:metal;gl_FragColor=vec4(vec3(value),1);return;}
 vec3 F0=mix(vec3(.04),base,metal);mat3 frame=localFrame(N,V);vec2 amp;mat3 A=getMinv(N,V,rough,amp)*frame;
 vec3 result=ambient(base,N);
 for(int i=0;i<ML;i++){
  if((uLightMask & (1<<i))==0)continue;
  AreaLight l=uLights[i];if(l.count<3||dot(l.radiance,l.radiance)<1e-9||!lightFaces(l,vWorld))continue;
  float falloff=lightFade(l,vWorld);if(falloff<=0.)continue;
  float Ed=metal>.999?0.:visibleIntegral(i,l,frame,vWorld),Es=visibleIntegral(i,l,A,vWorld);
  vec3 cd=vec3(1),cs=vec3(1);if(l.pattern>0){if(Ed>1e-8)cd=emissionFilter(i,l,frame,vWorld);if(Es>1e-8)cs=emissionFilter(i,l,A,vWorld);}
  result+=falloff*l.radiance*(base*(1.-metal)*Ed*cd+(F0*amp.x+(1.-F0)*amp.y)*Es*cs);
 }
 gl_FragColor=vec4(max(result,vec3(0)),1);
}`;
const referenceFragment=commonShader+`
uniform int uFrame;
uint hash32(uint x){x^=x>>16u;x*=0x7feb352du;x^=x>>15u;x*=0x846ca68bu;x^=x>>16u;return x;}
float rng(inout uint s){s=hash32(s+0x9e3779b9u);return float(s)/4294967296.;}
vec2 emitterUV(AreaLight l,vec3 P){vec3 d=P-l.center;return vec2(dot(d,l.U),dot(d,l.V))/l.size+.5;}
float lightPdf(AreaLight l,vec3 P,vec3 L,out bool hit,out vec3 target){
 float denom=dot(l.N,L);hit=false;target=P;if(abs(denom)<1e-8)return 0.;float t=dot(l.N,l.center-P)/denom;if(t<=0.)return 0.;target=P+t*L;
 vec3 d=target-l.center;hit=insidePolygon(l,vec2(dot(d,l.U),dot(d,l.V)))&&lightFaces(l,P);return t*t/max(l.area*abs(denom),1e-12);
}
vec3 sampleLight(AreaLight l,inout uint seed){
 float pick=rng(seed);int idx=l.triCount-1;for(int i=0;i<MT;i++){if(i>=l.triCount)break;if(pick<=l.tris[i].w){idx=i;break;}}
 vec4 tr=l.tris[idx];float a=sqrt(rng(seed)),b=rng(seed);
 return lightVertex(l,int(tr.x))*(1.-a)+lightVertex(l,int(tr.y))*(a*(1.-b))+lightVertex(l,int(tr.z))*(a*b);
}
void main(){
 vec3 N=normalize(vNormal),Vw=normalize(cameraPosition-vWorld);if(dot(N,Vw)<0.)N=-N;mat3 frame=localFrame(N,Vw);vec3 V=frame*Vw;
 vec3 base;float rough,metal;surfaceParams(base,rough,metal);vec3 F0=mix(vec3(.04),base,metal);float alpha=max(rough*rough,1e-5);vec3 result=ambient(base,N);
 uint seed=hash32(uint(gl_FragCoord.x)+uint(gl_FragCoord.y)*65537u+uint(uFrame)*1911520717u);
 for(int i=0;i<ML;i++){
  if((uLightMask & (1<<i))==0)continue;
  AreaLight l=uLights[i];if(l.count<3||dot(l.radiance,l.radiance)<1e-9||!lightFaces(l,vWorld))continue;
  float falloff=lightFade(l,vWorld);if(falloff<=0.)continue;
  vec3 sum=vec3(0);bool textured=l.pattern>0;bool sampledDiffuse=textured||shadowApplies(i,l,vWorld);
  if(uReferenceModel==1){
   vec2 amp;mat3 A=getMinv(N,Vw,rough,amp)*frame;float detA=abs(determinant(A));
   for(int sampleId=0;sampleId<4;sampleId++){
    vec3 target=sampleLight(l,seed);if(rayBlocked(i,l,vWorld,target))continue;
    vec3 delta=target-vWorld;float d2=max(dot(delta,delta),1e-12);vec3 w=delta*inversesqrt(d2),q=A*w;
    float solidAngle=l.area*abs(dot(l.N,w))/d2,sz=max(dot(q,q),1e-12);
    float density=detA*max(q.z,0.)/(PI*sz*sz);
    vec3 emission=textured?rawEmission(i,emitterUV(l,target)):vec3(1);
    sum+=emission*solidAngle*(base*(1.-metal)*max(dot(N,w),0.)/PI+(F0*amp.x+(1.-F0)*amp.y)*density);
   }
   result+=falloff*l.radiance*sum*.25;continue;
  }
  for(int s=0;s<2;s++){
   vec3 target=sampleLight(l,seed),delta=target-vWorld;float dist2=max(dot(delta,delta),1e-12);vec3 Lw=delta*inversesqrt(dist2),L=frame*Lw;
   float pa=dist2/max(l.area*abs(dot(l.N,Lw)),1e-12),pb;vec3 val=ggxCos(V,L,alpha,F0,pb);
   if(sampledDiffuse)val+=base*(1.-metal)*max(L.z,0.)/PI;
   vec3 emission=textured?rawEmission(i,emitterUV(l,target)):vec3(1);
   if(!rayBlocked(i,l,vWorld,target))sum+=emission*val/max(pa+pb,1e-12);
   float u=rng(seed),phi=2.*PI*rng(seed),ch=sqrt((1.-u)/(1.+(alpha*alpha-1.)*u)),sh=sqrt(max(0.,1.-ch*ch));
   vec3 h=vec3(sh*cos(phi),sh*sin(phi),ch);L=reflect(-V,h);val=ggxCos(V,L,alpha,F0,pb);
   if(sampledDiffuse)val+=base*(1.-metal)*max(L.z,0.)/PI;
   bool hit;pa=lightPdf(l,vWorld,transpose(frame)*L,hit,target);
   if(hit&&L.z>0.&&!rayBlocked(i,l,vWorld,target)){emission=textured?rawEmission(i,emitterUV(l,target)):vec3(1);sum+=emission*val/max(pa+pb,1e-12);}
  }
  sum*=.5;if(!sampledDiffuse)sum+=base*(1.-metal)*polygonIntegral(l,frame,vWorld);
  result+=falloff*l.radiance*sum;
 }
 gl_FragColor=vec4(max(result,vec3(0)),1);
}`;
const quadVertex=`varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0,1);}`;
const rawFragment=lightDeclarations+`
varying vec2 vUv;
float segDistance(vec2 p,vec2 a,vec2 b){vec2 e=b-a;return length(p-a-e*clamp(dot(p-a,e)/max(dot(e,e),1e-12),0.,1.));}
void main(){
 int id=min(4,int(floor(vUv.y*5.)));AreaLight l=uLights[id];vec2 uv=vec2(vUv.x,fract(vUv.y*5.)),p=(uv-.5)*l.size;
 if(l.count<3||!insidePolygon(l,p)){gl_FragColor=vec4(0);return;}
 vec3 c=vec3(1);float t=l.phase;
 if(l.pattern==1){
  float edge=100.;for(int i=0;i<MV;i++){if(i>=l.count)break;int j=i+1==l.count?0:i+1;edge=min(edge,segDistance(p,l.poly[i],l.poly[j]));}
  float rim=exp(-edge*95./min(l.size.x,l.size.y));
  vec2 g=uv*vec2(13.,17.);float grid=pow(max(abs(sin(g.x*PI+sin(g.y*PI)*.5)),abs(sin(g.y*PI))),26.);
  float pulse=pow(.5+.5*sin(uv.y*14.-t*1.8),12.);
  float arc=exp(-abs(length((uv-.5)*vec2(1.,.85))-(.26+.02*sin(t)))*180.);
  float age=l.impact.z,dist=length((uv-l.impact.xy)*vec2(l.size.x/l.size.y,1.));
  float hit=age>=0.?exp(-pow((dist-age*.72)/.022,2.))*exp(-age*1.8)*l.impact.w:0.;
  c=vec3(.065,.095,.13)+grid*vec3(.018,.038,.04)+pulse*vec3(.035,.085,.10)+rim*vec3(.8,1.,1.)+arc*.15+hit*vec3(1.1,.9,1.);
 }else if(l.pattern==2){
  float wave=.5+.5*sin(uv.x*9.-t*1.5+sin(uv.y*5.+t*.7)*1.2);c=mix(vec3(.045,.21,.7),vec3(1.,.24,.035),smoothstep(.16,.86,wave));
  c*=.35+.65*smoothstep(.10,.5,.5+.5*sin(uv.y*7.+uv.x*2.+t*.3));
 }else if(l.pattern==3){
  float a=sin(uv.x*13.+t+sin(uv.y*9.-t*.8)),b=sin(uv.y*17.+t*.9+sin(uv.x*8.+t));
  float spark=pow(1.-abs(sin((a+b)*3.+t)),16.);c=mix(vec3(.035,.10,.32),vec3(.36,.035,.6),.5+.5*a)+spark*vec3(.55,.8,1.);
 }else if(l.pattern==4){
  vec2 q=(uv-.5)*2.;float ring=1.-smoothstep(.06,.09,abs(length(q)-.63));float crossX=1.-smoothstep(.055,.085,min(abs(q.x-q.y),abs(q.x+q.y)));
  float disk=1.-smoothstep(.55,.7,length(q));c=vec3(.035,.055,.09)+(ring+crossX*disk)*vec3(.75,.9,1.)*(.7+.3*sin(t*1.5));
 }else if(l.pattern==5){
  float d=length((uv-.5)*2.);float rings=pow(.5+.5*cos(d*24.-t*4.),12.);c=vec3(.14,.08,.32)+rings*vec3(.6,.55,.85);
 }else if(l.pattern==6){
  vec2 q=uv;if(l.paintMotion>1.5&&l.paintMotion<2.5)q.x=fract(q.x-t*.09);
  q=clamp(q,vec2(.5/256.),vec2(1.-.5/256.));
  vec4 ink=texture2D(uUserEmission,vec2(q.x,(float(id)+q.y)/5.));
  c=mix(pow((ink.rgb+.055)/1.055,vec3(2.4)),ink.rgb/12.92,lessThanEqual(ink.rgb,vec3(.04045)))*ink.a;
  if(l.paintMotion>.5&&l.paintMotion<1.5)c*=.55+.45*sin(t*2.);
  if(l.paintMotion>2.5)c*=.16+.84*exp(-pow((uv.x-fract(t*.12))/.14,2.));
 }
 gl_FragColor=vec4(c,1);
}`;
const prefilterFragment=lightDeclarations+`
uniform sampler2D uHorizontal;uniform int uPass;varying vec2 vUv;
float segmentDist(vec2 p,vec2 a,vec2 b){vec2 e=b-a;return length(p-a-e*clamp(dot(p-a,e)/max(dot(e,e),1e-12),0.,1.));}
void main(){
 int id=min(4,int(vUv.y*5.)),level=min(7,int(vUv.x*8.));AreaLight l=uLights[id];vec2 tile=fract(vUv*vec2(8.,5.)),uv=tile*2.-.5;
 if(l.count<3){gl_FragColor=vec4(0);return;}
 float sigma=filterSigma(level),distanceToMask=1e3;vec2 p=(uv-.5)*l.size;
 if(!insidePolygon(l,p)){for(int i=0;i<MV;i++){if(i>=l.count)break;int j=i+1==l.count?0:i+1;distanceToMask=min(distanceToMask,segmentDist(p,l.poly[i],l.poly[j])/max(l.size.x,l.size.y));}sigma=max(sigma,distanceToMask*.65+.015);}
 vec4 sum=vec4(0);
 if(level==7){
  gl_FragColor=texture2D(uMean,vec2(.5,(float(id)+.5)/5.));return;
 }
 for(int k=-8;k<=8;k++){
  float f=float(k)*.375,w=exp(-.5*f*f);vec2 q=uv+(uPass==0?vec2(f*sigma,0):vec2(0,f*sigma));
  if(uPass==0){if(q.x>=0.&&q.x<=1.&&q.y>=0.&&q.y<=1.){vec2 z=clamp(q,vec2(.5/128.),vec2(1.-.5/128.));vec4 a=texture2D(uRaw,vec2(z.x,(float(id)+z.y)/5.));sum+=vec4(a.rgb*a.a,a.a)*w;}}
  else if(q.y>=-.5&&q.y<=1.5){vec2 z=clamp((q+.5)*.5,vec2(.5/128.),vec2(1.-.5/128.));sum+=texture2D(uHorizontal,vec2((float(level)+z.x)/8.,(float(id)+z.y)/5.))*w;}
 }
 gl_FragColor=uPass==0?sum:vec4(sum.rgb/max(sum.a,1e-10),1);
}`;
const meanFragment=lightDeclarations+`varying vec2 vUv;
void main(){int id=min(4,int(vUv.y*5.));vec4 sum=vec4(0);
 for(int y=0;y<12;y++)for(int x=0;x<12;x++){vec2 q=(vec2(x,y)+.5)/12.;vec4 a=texture2D(uRaw,vec2(q.x,(float(id)+q.y)/5.));sum+=vec4(a.rgb*a.a,a.a);}
 gl_FragColor=vec4(sum.rgb/max(sum.a,1e-10),1.);}`;
const emitterFragment=lightDeclarations+`uniform int uEmitter;varying vec2 vUV;void main(){AreaLight l=uLights[uEmitter];vec3 c=l.pattern>0?rawEmission(uEmitter,vUV):vec3(1);gl_FragColor=vec4(l.radiance*c,1);}`;
const accumulationFragment=`uniform sampler2D uPrev,uNew;uniform float uFrames;varying vec2 vUv;void main(){vec3 a=texture2D(uNew,vUv).rgb,b=texture2D(uPrev,vUv).rgb;gl_FragColor=vec4(uFrames<.5?a:mix(b,a,1./(uFrames+1.)),1);}`;
const compositeFragment=`
uniform sampler2D uLTC,uReference,uGlow;uniform int uMode;uniform float uSplit,uExposure,uBloom;varying vec2 vUv;
vec3 aces(vec3 x){return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.);}
vec3 srgb(vec3 x){return mix(1.055*pow(max(x,vec3(0)),vec3(1./2.4))-.055,x*12.92,lessThanEqual(x,vec3(.0031308)));}
vec3 heat(float x){vec3 a=vec3(.025,.055,.095),b=vec3(.05,.47,.58),c=vec3(1,.66,.18),d=vec3(1,.16,.12);return x<.10?mix(a,b,x/.10):x<.35?mix(b,c,(x-.10)/.25):mix(c,d,clamp((x-.35)/.65,0.,1.));}
void main(){vec3 a=texture2D(uLTC,vUv).rgb,b=texture2D(uReference,vUv).rgb;if(uMode==2){gl_FragColor=vec4(srgb(heat(length(a-b)/max(length(b),.03))),1);return;}
vec3 c=a;if(uMode==1&&vUv.x>uSplit)c=b;if(uMode==3)c=b;if(uBloom>0.&&uMode==0)c+=texture2D(uGlow,vUv).rgb*uBloom;
gl_FragColor=vec4(srgb(aces(c*uExposure)),1);}`;
const bloomFragment=`uniform sampler2D uSource;uniform vec2 uOffset;uniform float uThreshold;varying vec2 vUv;
vec3 tap(vec2 q){vec3 c=texture2D(uSource,q).rgb;return uThreshold>.5?max(c-vec3(.85),vec3(0)):c;}
void main(){vec3 c=tap(vUv)*.227027;c+=(tap(vUv+uOffset*1.384615)+tap(vUv-uOffset*1.384615))*.316216;c+=(tap(vUv+uOffset*3.230769)+tap(vUv-uOffset*3.230769))*.070270;gl_FragColor=vec4(c,1);}`;

const sphereDensityFragment=`
uniform mat3 uInv;uniform float uPeak;varying vec3 vDir;
void main(){vec3 w=normalize(vDir),p=uInv*w;float l2=dot(p,p);float D=max(p.z,0.0)*abs(determinant(uInv))/(3.14159265*l2*l2);
 float t=clamp(log(1.0+D*10.0)/max(log(1.0+uPeak*10.0),1.0),0.0,1.0);
 vec3 a=vec3(.032,.09,.16),b=vec3(.06,.44,.47),c=vec3(1,.64,.27),d=vec3(1,.90,.69);
 vec3 col=t<.35?mix(a,b,t/.35):t<.8?mix(b,c,(t-.35)/.45):mix(c,d,(t-.8)/.2);
 float fres=pow(1.0-abs(dot(normalize(cameraPosition),w)),4.0);col+=fres*.09;
 gl_FragColor=vec4(col,.90);
}`;
