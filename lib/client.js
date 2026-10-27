window.__ModuleLoader__.load({
  id: "dsh-jump",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
"use strict";var R=Object.defineProperty;var oe=Object.getOwnPropertyDescriptor;var re=Object.getOwnPropertyNames;var se=Object.prototype.hasOwnProperty;var ae=(e,t)=>{for(var n in t)R(e,n,{get:t[n],enumerable:!0})},ce=(e,t,n,i)=>{if(t&&typeof t=="object"||typeof t=="function")for(let r of re(t))!se.call(e,r)&&r!==n&&R(e,r,{get:()=>t[r],enumerable:!(i=oe(t,r))||i.enumerable});return e};var le=e=>ce(R({},"__esModule",{value:!0}),e);var Ne={};ae(Ne,{boot:()=>Me,clientPlugin:()=>Z,default:()=>Ie});module.exports=le(Ne);var ue=["Escape","Tab","Enter"," ","Backspace","Delete","ArrowUp","ArrowDown","ArrowLeft","ArrowRight","Dead","CapsLock","AltGraph","Unidentified","Meta","Control","Alt","Shift","OS",""],de={ctrl:"\u2303",alt:"\u2325",shift:"\u21E7",meta:"\u2318"},pe={ctrl:"Ctrl",alt:"Alt",shift:"Shift",meta:"Meta"},me={" ":"Space",Escape:"Esc",Enter:"\u21A9",Tab:"\u21E5",Backspace:"\u232B",Delete:"\u2326",ArrowUp:"\u2191",ArrowDown:"\u2193",ArrowLeft:"\u2190",ArrowRight:"\u2192"},fe={" ":"Space"};function v(e){let t=e.trim().toLowerCase();return t===""||/mac|darwin|iphone|ipad/.test(t)?"macos":"other"}function b(e){let t=e==="macos"?{meta:!0,ctrl:!1}:{meta:!1,ctrl:!0};return{click:{key:"h",alt:!1,shift:!1,...t},focus:{key:"u",alt:!1,shift:!1,...t}}}function A(e){return typeof e=="object"&&e!==null&&!Array.isArray(e)}function x(e,t){return e[t]===!0||t==="ctrl"&&e.control===!0}function w(e,t,n="macos"){if(typeof e=="string")return e.length!==1?t:{key:e.toLowerCase(),meta:n==="macos",alt:!1,ctrl:n!=="macos",shift:!1};if(!A(e))return t;let i=e.key;return typeof i!="string"||i.length===0?t:{key:i.length===1?i.toLowerCase():i,meta:x(e,"meta"),alt:x(e,"alt"),ctrl:x(e,"ctrl"),shift:x(e,"shift")}}function S(e,t="macos"){let n=b(t),i=A(e)?e:{};return{click:w(i.click,n.click,t),focus:w(i.focus,n.focus,t)}}function E(e,t){return e.key.toLowerCase()===t.key.toLowerCase()&&e.meta===t.meta&&e.alt===t.alt&&e.ctrl===t.ctrl&&e.shift===t.shift}function T(e,t){return ue.includes(e.key)?"reserved-key":!e.meta&&!e.alt&&!e.ctrl?"no-modifier":t.some(n=>E(n,e))?"duplicate":null}function B(e,t){return e.isComposing?!1:e.key.toLowerCase()===t.key.toLowerCase()&&e.metaKey===t.meta&&e.altKey===t.alt&&e.ctrlKey===t.ctrl&&e.shiftKey===t.shift}function ge(e,t){let i=(t==="macos"?me:fe)[e];return i!==void 0?i:e.length===1?e.toUpperCase():e}function j(e,t){let i=["ctrl","alt","shift","meta"].filter(a=>e[a]).map(a=>t==="macos"?de[a]:pe[a]);return i.push(ge(e.key,t)),t==="macos"?i.join(""):i.join("+")}var m=["a","s","d","f","g","h","j","k","l"],ye=["button","link","tab","treeitem","option","menuitem","menuitemcheckbox","menuitemradio","checkbox","radio","switch","slider","spinbutton"],J=["textbox","searchbox"],he=["a[href]","area[href]","button","input:not([type=hidden])","select","textarea","summary","[tabindex]","[contenteditable]:not([contenteditable=false])",...ye.map(e=>`[role=${e}]`),...J.map(e=>`[role=${e}]`)].join(", "),L={candidateSelector:he};function*be(e=1){if(e<=1){yield*m;return}let t=[...m];for(let n=1;n<e;n+=1){let i=[];for(let r of t){let a=r[r.length-1];if(a===void 0)break;for(let s of m)s!==a&&i.push(r+s);i.push(r+a)}t=i}yield*t}var P=m.length;function xe(e){let t=1,n=P;for(;e>n;)t+=1,n*=P;return t}function O(e,t,n){let i=[];for(let s of e()){let o=s.getBoundingClientRect();o.width>0&&o.height>0&&o.x<t.width&&o.x+o.width>0&&o.y<t.height&&o.y+o.height>0&&n.isVisible(s)&&i.push({element:s,rect:{x:o.x,y:o.y,w:o.width,h:o.height}})}let r=i.filter(({element:s})=>!i.some(o=>o.element!==s&&s.contains(o.element))),a=be(xe(r.length));return r.map(s=>{let o=a.next();if(o.done)throw new Error("dsh-jump: label space exhausted");return{element:s.element,label:o.value,rect:s.rect}})}function D(){return{mode:"idle",pending:""}}function _(e){e.mode="idle",e.pending=""}function H(e,t,n,i){if(e.mode==="idle")return B(t,i.click)?(e.mode="click",e.pending="",{type:"activate-click"}):B(t,i.focus)?(e.mode="focus",e.pending="",{type:"activate-focus"}):{type:"ignore"};if(t.key==="Escape")return _(e),{type:"exit"};if(t.metaKey||t.ctrlKey||t.altKey)return _(e),{type:"exit"};if(t.shiftKey||t.isComposing)return{type:"ignore"};if(!m.includes(t.key))return e.pending="",{type:"ignore"};let r=e.pending+t.key;return n.includes(r)?(e.pending="",{type:"label",key:t.key}):n.some(a=>a.length>r.length&&a.startsWith(r))?(e.pending=r,{type:"label",key:t.key}):(e.pending="",{type:"ignore"})}function M(e={}){let t=e.doc??globalThis.document,n=e.viewport??(()=>({width:globalThis.innerWidth,height:globalThis.innerHeight})),i;function r(){if(i!==void 0)return i;let s=t.createElement("div");return s.dataset.dshJumpOverlay="",s.style.cssText="position:fixed;inset:0;z-index:2147483647;pointer-events:none",t.documentElement.append(s),i=s,s}function a(s,o){let c=t.createElement("div");c.dataset.jumpLabel=s.label,c.textContent=s.label;let{width:l,height:u}=n(),f=Math.min(Math.max(s.rect.x,0),Math.max(l-24,0)),d=Math.min(Math.max(s.rect.y,0),Math.max(u-16,0));return c.style.cssText="position:fixed;left:"+String(Math.round(f))+"px;top:"+String(Math.round(d))+"px;padding:1px 3px;background:#ffd60a;color:#000;border-radius:3px;font:11px/1.3 ui-monospace,Menlo,monospace;pointer-events:none;opacity:"+(o?"1":"0.3"),c}return{render(s,o=""){r().replaceChildren(...s.map(l=>a(l,l.label.startsWith(o))))},destroy(){i?.remove(),i=void 0}}}var we=new Set(["text","search","url","tel","email","password","number","date","month","week","time","datetime-local"]),ve=new Set(["TEXTAREA"]);function Ee(e){let t=e.getAttribute("contenteditable");return t===null?!1:t.trim().toLowerCase()!=="false"}function I(e){if(Ee(e))return"focus";let t=e.tagName;if(t==="INPUT"){let i=(e.getAttribute("type")??"text").trim().toLowerCase();return we.has(i)?"focus":"click"}if(ve.has(t))return"focus";let n=e.getAttribute("role");return n!==null&&J.includes(n.trim().toLowerCase())?"focus":"click"}function ke(e){let t=e;if(typeof t.checkVisibility=="function")return t.checkVisibility();let n=t.ownerDocument?.defaultView;return t.offsetParent!==null||n?.getComputedStyle(t).position==="fixed"}function Re(e,t,n){let i=e.ownerDocument?.defaultView;if(i==null)return;let r=(o,c)=>new i.MouseEvent(o,{bubbles:!0,cancelable:!0,clientX:t,clientY:n,button:0,buttons:c}),a=i.PointerEvent,s=(o,c)=>a===void 0?r(o,c):new a(o,{bubbles:!0,cancelable:!0,clientX:t,clientY:n,button:0,buttons:c,pointerId:1,pointerType:"mouse",isPrimary:!0});e.dispatchEvent(s("pointerdown",1)),e.dispatchEvent(r("mousedown",1)),e.dispatchEvent(s("pointerup",0)),e.dispatchEvent(r("mouseup",0)),e.dispatchEvent(r("click",0))}function Se(e,t){let n=e;if(typeof n.focus!="function"||t.activeElement===e||(n.focus(),t.activeElement!==e))return;let i=t.getSelection?.()??null;if(i===null)return;let r=t.createRange();r.selectNodeContents(e),r.collapse(!1),i.removeAllRanges(),i.addRange(r)}function Be(){return globalThis.navigator?.platform??""}function N(e={}){let t=e.window??globalThis,n={...L,...e.config},i=e.isVisible??ke,r=e.platform??v(Be()),a=b(r),s=e.bindings??{get:()=>a},o=M({doc:t.document,viewport:()=>({width:t.innerWidth,height:t.innerHeight})});function c(){let l=O(()=>Array.from(t.document.querySelectorAll(n.candidateSelector)),{width:t.innerWidth,height:t.innerHeight},{isVisible:i});return o.render(l),l}return{apply(){let l=D(),u=[],f=d=>{let g=l.pending,k={key:d.key,metaKey:d.metaKey,ctrlKey:d.ctrlKey,altKey:d.altKey,shiftKey:d.shiftKey,isComposing:d.isComposing},Q=l.mode!=="idle",y=H(l,k,u.map(h=>h.label),s.get());if((Q||y.type!=="ignore")&&(d.preventDefault(),d.stopPropagation()),y.type==="ignore"){l.pending!==g&&o.render(u,l.pending);return}if(y.type==="activate-click"||y.type==="activate-focus"){u=c();return}if(y.type==="exit"){u=[],o.destroy();return}if(l.pending!==g&&o.render(u,l.pending),l.pending!=="")return;let ee=g+y.key,p=u.find(h=>h.label===ee);u=[],o.destroy();let te=l.mode;if(l.mode="idle",p===void 0)return;let ne=p.rect.x+p.rect.w/2,ie=p.rect.y+p.rect.h/2;if(I(p.element)==="focus")Se(p.element,t.document);else if(te==="click")Re(p.element,ne,ie);else{let h=p.element;typeof h.focus=="function"&&h.focus()}};return t.addEventListener("keydown",f,{capture:!0}),()=>{t.removeEventListener("keydown",f,{capture:!0}),o.destroy(),u=[]}}}}var Je={title:"\u8DF3\u8DC3\u5BFC\u822A\u5FEB\u6377\u952E",description:"\u6309\u4E0B\u7EC4\u5408\u952E\u540E\uFF0C\u7528\u5B57\u6BCD\u6807\u7B7E\u9009\u4E2D\u70B9\u51FB\u6216\u805A\u7126\u76EE\u6807\u3002",recording:"\u6309\u4E0B\u7EC4\u5408\u952E",recordingHint:"Esc \u53D6\u6D88",reset:"\u6062\u590D\u9ED8\u8BA4",clickName:"\u70B9\u51FB\u6A21\u5F0F\u7684\u5FEB\u6377\u952E",focusName:"\u805A\u7126\u6A21\u5F0F\u7684\u5FEB\u6377\u952E",issues:{"no-modifier":"\u9700\u8981\u4E00\u4E2A \u2318 \u6216 \u2303 \u6216 \u2325 \u4FEE\u9970\u952E","reserved-key":"\u8FD9\u4E2A\u952E\u88AB\u754C\u9762\u5360\u7528\u4E86",duplicate:"\u5DF2\u7ECF\u5206\u914D\u7ED9\u53E6\u4E00\u4E2A\u6A21\u5F0F"}},Ce={title:"Jump navigation shortcuts",description:"Press a chord, then type a label to click or focus a target.",recording:"Press a chord",recordingHint:"Esc to cancel",reset:"Restore defaults",clickName:"Click-mode shortcut",focusName:"Focus-mode shortcut",issues:{"no-modifier":"Needs a \u2318, \u2303 or \u2325 modifier","reserved-key":"That key belongs to the interface",duplicate:"Already bound to the other mode"}};function W(e){return e.toLowerCase().startsWith("en")?Ce:Je}var Ke=new Set(["Meta","Control","Alt","Shift","AltGraph","CapsLock","OS"]);function Y(e,t,n){if(e.key==="Escape")return{status:"cancel"};if(Ke.has(e.key)||e.isComposing)return{status:"pending"};let i=w({key:e.key,meta:e.metaKey,alt:e.altKey,ctrl:e.ctrlKey,shift:e.shiftKey},{key:e.key,meta:!1,alt:!1,ctrl:!1,shift:!1},n),r=T(i,t);return r!==null?{status:"rejected",issue:r}:{status:"accepted",binding:i}}function Ae(e,t){return[t==="click"?e.focus:e.click]}function G(e){let{store:t,platform:n}=e,i=new Set,r={bindings:t.get(),recording:null,issue:null},a=s=>{if(!(s.bindings===r.bindings&&s.recording===r.recording&&s.issue===r.issue)){r=s;for(let o of i)o(r)}};return t.subscribe(s=>{a({...r,bindings:s,issue:null})}),{getState:()=>r,begin(s){a({...r,recording:s,issue:null})},press(s){let o=r.recording;if(o===null)return"idle";let c=Y(s,Ae(r.bindings,o),n);return c.status==="pending"?"pending":c.status==="cancel"?(a({...r,recording:null,issue:null}),"cancelled"):c.status==="rejected"?(a({...r,issue:c.issue}),"rejected"):(t.set({...r.bindings,[o]:c.binding}),a({...r,bindings:t.get(),recording:null,issue:null}),"saved")},reset(){t.reset(),a({bindings:t.get(),recording:null,issue:null})},subscribe(s){return i.add(s),()=>{i.delete(s)}}}}var Te=`
[data-dsh-jump-settings] {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 60px;
  padding: 16px 0;
  border-bottom: 0.5px solid var(--dsw-alias-border-l2);
}
[data-dsh-jump-settings] [data-dsh-jump-text] {
  display: flex;
  flex-direction: column;
  flex: 1;
  gap: 4px;
  min-width: 0;
  padding-right: 48px;
}
[data-dsh-jump-settings] [data-dsh-jump-title] {
  color: var(--dsw-alias-label-primary);
  font-size: 14px;
  line-height: 22px;
}
[data-dsh-jump-settings] [data-dsh-jump-description] {
  margin: 0;
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  line-height: 18px;
}
[data-dsh-jump-settings] [data-dsh-jump-actions] {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 8px;
}
[data-dsh-jump-settings] [data-dsh-jump-chord] {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  min-width: 92px;
  height: 36px;
  padding: 0 14px;
  border: none;
  border-radius: var(--dsw-radius-md);
  background: var(--dsw-alias-bg-module-platform);
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 14px;
  line-height: 22px;
  cursor: pointer;
  white-space: nowrap;
}
[data-dsh-jump-settings] [data-dsh-jump-chord]:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}
[data-dsh-jump-settings] [data-dsh-jump-chord][data-recording] {
  outline: 1px solid var(--dsw-alias-label-primary);
  outline-offset: -1px;
}
[data-dsh-jump-settings] [data-dsh-jump-reset] {
  height: 36px;
  padding: 0 12px;
  border: none;
  border-radius: var(--dsw-radius-md);
  background: transparent;
  color: var(--dsw-alias-label-tertiary);
  font: inherit;
  font-size: 12px;
  line-height: 18px;
  cursor: pointer;
}
[data-dsh-jump-settings] [data-dsh-jump-reset]:hover {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}
[data-dsh-jump-settings] [data-dsh-jump-issue] {
  margin: 0;
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  line-height: 18px;
}
`,V="dsh-jump/settings.css";function q(e){let t=`style[data-plugin-css=${JSON.stringify(V)}]`;if(e.querySelector(t)!==null)return()=>{};let n=e.createElement("style");return n.dataset.plugin="dsh-jump",n.dataset.pluginCss=V,n.textContent=Te,e.head.append(n),()=>n.remove()}function z(e){let{React:t,action:n,state:i,copy:r,platform:a,onBegin:s}=e,o=i.recording===n,c=i.bindings[n],l=j(c,a);return t.createElement("button",{type:"button","data-dsh-jump-chord":n,"data-recording":o?"":void 0,"aria-label":n==="click"?r.clickName:r.focusName,"aria-keyshortcuts":l,onClick:()=>{s(n)}},o?r.recording:l)}function F(e){let{React:t,controller:n,platform:i,copy:r}=e,a=t.useSyncExternalStore(o=>n.subscribe(()=>o()),()=>n.getState());je(t,a.recording,o=>{n.press({key:o.key,metaKey:o.metaKey,ctrlKey:o.ctrlKey,altKey:o.altKey,shiftKey:o.shiftKey,isComposing:o.isComposing})});let s=a.issue===null?null:r.issues[a.issue];return t.createElement("div",{"data-dsh-jump-settings":""},t.createElement("div",{"data-dsh-jump-text":""},t.createElement("div",{"data-dsh-jump-title":""},r.title),t.createElement("p",{"data-dsh-jump-description":""},a.recording===null?r.description:r.recordingHint),s===null?null:t.createElement("p",{"data-dsh-jump-issue":"",role:"status"},s)),t.createElement("div",{"data-dsh-jump-actions":""},z({React:t,action:"click",state:a,copy:r,platform:i,onBegin:o=>n.begin(o)}),z({React:t,action:"focus",state:a,copy:r,platform:i,onBegin:o=>n.begin(o)}),t.createElement("button",{type:"button","data-dsh-jump-reset":"",onClick:()=>n.reset()},r.reset)))}function je(e,t,n){let i=e.useRef(n);i.current=n,e.useEffect(()=>{if(t===null)return;let r=s=>{s.preventDefault(),s.stopPropagation(),i.current(s)},a=globalThis.document;return a.addEventListener("keydown",r,{capture:!0}),()=>{a.removeEventListener("keydown",r,{capture:!0})}},[t])}var C="dsh-jump:bindings:v1";function Le(e,t){return E(e.click,t.click)&&E(e.focus,t.focus)}function Pe(){try{return globalThis.localStorage??null}catch{return null}}function U(e){let t=b(e.platform),n=e.storage===void 0?Pe():e.storage,i=new Set,r=()=>{if(n===null)return t;try{let o=n.getItem(C);return o===null?t:S(JSON.parse(o),e.platform)}catch{return t}},a=r(),s=o=>{if(!Le(a,o)){a=o;for(let c of i)c(a)}};return{get:()=>a,set(o){if(s(S(o,e.platform)),n!==null)try{n.setItem(C,JSON.stringify(a))}catch{}},reset(){if(s(t),n!==null)try{n.removeItem(C)}catch{}},reload(){s(r())},subscribe(o){return i.add(o),()=>{i.delete(o)}}}}var X="settings.general.item",Oe="jump",_e=18;function $(e){let{ctx:t,platform:n,React:i,config:r}=e,a=e.store??U({platform:n}),s=N({config:r,bindings:a,platform:n,window:e.window}),o=[s.apply()];return i!==null&&o.push(t.inject(["slots"],c=>{let l=c.get("slots");if(l===void 0)return;let u=c.get("locale"),f=G({store:a,platform:n}),d=l.inject(X,()=>l.register({name:X,id:Oe,order:_e},()=>F({React:i,controller:f,platform:n,copy:W(u?.getSnapshot().active??"zh")}))),g=e.document??globalThis.document,k=g===void 0?void 0:q(g);return()=>{d(),k?.()}})),{store:a,app:s,dispose(){for(;o.length>0;)o.pop()?.()}}}var K=null;function De(){return v(globalThis.navigator?.platform??"")}function He(){if(K===null)return null;let e=K("react");for(let t of["createElement","useEffect","useRef","useSyncExternalStore"])if(typeof e?.[t]!="function")return null;return e}var Z={name:"dsh-jump",inject:[],apply(e,t){let n=$({ctx:e,platform:De(),React:He(),config:t});return()=>n.dispose()}};function Me(e){K=e}var Ie=Z;

module.exports.boot(require);
    return module.exports.default ?? module.exports;
  }
});
