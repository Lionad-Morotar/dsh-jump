window.__ModuleLoader__.load({
  id: "dsh-jump",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
"use strict";var k=Object.defineProperty;var oe=Object.getOwnPropertyDescriptor;var re=Object.getOwnPropertyNames;var se=Object.prototype.hasOwnProperty;var ae=(e,t)=>{for(var n in t)k(e,n,{get:t[n],enumerable:!0})},ce=(e,t,n,o)=>{if(t&&typeof t=="object"||typeof t=="function")for(let r of re(t))!se.call(e,r)&&r!==n&&k(e,r,{get:()=>t[r],enumerable:!(o=oe(t,r))||o.enumerable});return e};var le=e=>ce(k({},"__esModule",{value:!0}),e);var Ne={};ae(Ne,{boot:()=>Me,clientPlugin:()=>$,default:()=>Ie});module.exports=le(Ne);var ue=["Escape","Tab","Enter"," ","Backspace","Delete","ArrowUp","ArrowDown","ArrowLeft","ArrowRight","Dead","CapsLock","AltGraph","Unidentified","Meta","Control","Alt","Shift","OS",""],de={ctrl:"\u2303",alt:"\u2325",shift:"\u21E7",meta:"\u2318"},pe={ctrl:"Ctrl",alt:"Alt",shift:"Shift",meta:"Meta"},me={" ":"Space",Escape:"Esc",Enter:"\u21A9",Tab:"\u21E5",Backspace:"\u232B",Delete:"\u2326",ArrowUp:"\u2191",ArrowDown:"\u2193",ArrowLeft:"\u2190",ArrowRight:"\u2192"},fe={" ":"Space"};function w(e){let t=e.trim().toLowerCase();return t===""||/mac|darwin|iphone|ipad/.test(t)?"macos":"other"}function h(e){let t=e==="macos"?{meta:!0,ctrl:!1}:{meta:!1,ctrl:!0};return{click:{key:"h",alt:!1,shift:!1,...t},focus:{key:"u",alt:!1,shift:!1,...t}}}function K(e){return typeof e=="object"&&e!==null&&!Array.isArray(e)}function b(e,t){return e[t]===!0||t==="ctrl"&&e.control===!0}function x(e,t,n="macos"){if(typeof e=="string")return e.length!==1?t:{key:e.toLowerCase(),meta:n==="macos",alt:!1,ctrl:n!=="macos",shift:!1};if(!K(e))return t;let o=e.key;return typeof o!="string"||o.length===0?t:{key:o.length===1?o.toLowerCase():o,meta:b(e,"meta"),alt:b(e,"alt"),ctrl:b(e,"ctrl"),shift:b(e,"shift")}}function R(e,t="macos"){let n=h(t),o=K(e)?e:{};return{click:x(o.click,n.click,t),focus:x(o.focus,n.focus,t)}}function v(e,t){return e.key.toLowerCase()===t.key.toLowerCase()&&e.meta===t.meta&&e.alt===t.alt&&e.ctrl===t.ctrl&&e.shift===t.shift}function A(e,t){return ue.includes(e.key)?"reserved-key":!e.meta&&!e.alt&&!e.ctrl?"no-modifier":t.some(n=>v(n,e))?"duplicate":null}function S(e,t){return e.isComposing?!1:e.key.toLowerCase()===t.key.toLowerCase()&&e.metaKey===t.meta&&e.altKey===t.alt&&e.ctrlKey===t.ctrl&&e.shiftKey===t.shift}function ge(e,t){let o=(t==="macos"?me:fe)[e];return o!==void 0?o:e.length===1?e.toUpperCase():e}function T(e,t){let o=["ctrl","alt","shift","meta"].filter(a=>e[a]).map(a=>t==="macos"?de[a]:pe[a]);return o.push(ge(e.key,t)),t==="macos"?o.join(""):o.join("+")}var f=["a","s","d","f","g","h","j","k","l"],ye=["button","link","tab","treeitem","option","menuitem","menuitemcheckbox","menuitemradio","checkbox","radio","switch","slider","spinbutton"],B=["textbox","searchbox"],he=["a[href]","area[href]","button","input:not([type=hidden])","select","textarea","summary","[tabindex]","[contenteditable]:not([contenteditable=false])",...ye.map(e=>`[role=${e}]`),...B.map(e=>`[role=${e}]`)].join(", "),L={candidateSelector:he};function*be(e=1){if(e<=1){yield*f;return}let t=[...f];for(let n=1;n<e;n+=1){let o=[];for(let r of t){let a=r[r.length-1];if(a===void 0)break;for(let s of f)s!==a&&o.push(r+s);o.push(r+a)}t=o}yield*t}var j=f.length;function xe(e){let t=1,n=j;for(;e>n;)t+=1,n*=j;return t}function P(e,t,n){let o=[];for(let s of e()){let i=s.getBoundingClientRect();i.width>0&&i.height>0&&i.x<t.width&&i.x+i.width>0&&i.y<t.height&&i.y+i.height>0&&n.isVisible(s)&&o.push({element:s,rect:{x:i.x,y:i.y,w:i.width,h:i.height}})}let r=o.filter(({element:s})=>!o.some(i=>i.element!==s&&s.contains(i.element))),a=be(xe(r.length));return r.map(s=>{let i=a.next();if(i.done)throw new Error("dsh-jump: label space exhausted");return{element:s.element,label:i.value,rect:s.rect}})}function _(){return{mode:"idle",pending:""}}function O(e){e.mode="idle",e.pending=""}function D(e,t,n,o){if(e.mode==="idle")return S(t,o.click)?(e.mode="click",e.pending="",{type:"activate-click"}):S(t,o.focus)?(e.mode="focus",e.pending="",{type:"activate-focus"}):{type:"ignore"};if(t.key==="Escape")return O(e),{type:"exit"};if(t.metaKey||t.ctrlKey||t.altKey)return O(e),{type:"exit"};if(t.shiftKey||t.isComposing)return{type:"ignore"};if(!f.includes(t.key))return e.pending="",{type:"ignore"};let r=e.pending+t.key;return n.includes(r)?(e.pending="",{type:"label",key:t.key}):n.some(a=>a.length>r.length&&a.startsWith(r))?(e.pending=r,{type:"label",key:t.key}):(e.pending="",{type:"ignore"})}function H(e={}){let t=e.doc??globalThis.document,n=e.viewport??(()=>({width:globalThis.innerWidth,height:globalThis.innerHeight})),o;function r(){if(o!==void 0)return o;let s=t.createElement("div");return s.dataset.dshJumpOverlay="",s.style.cssText="position:fixed;inset:0;z-index:2147483647;pointer-events:none",t.documentElement.append(s),o=s,s}function a(s,i){let c=t.createElement("div");c.dataset.jumpLabel=s.label,c.textContent=s.label;let{width:l,height:u}=n(),m=Math.min(Math.max(s.rect.x,0),Math.max(l-24,0)),d=Math.min(Math.max(s.rect.y,0),Math.max(u-16,0));return c.style.cssText="position:fixed;left:"+String(Math.round(m))+"px;top:"+String(Math.round(d))+"px;padding:1px 3px;background:#ffd60a;color:#000;border-radius:3px;font:11px/1.3 ui-monospace,Menlo,monospace;pointer-events:none;opacity:"+(i?"1":"0.3"),c}return{render(s,i=""){r().replaceChildren(...s.map(l=>a(l,l.label.startsWith(i))))},destroy(){o?.remove(),o=void 0}}}var we=new Set(["text","search","url","tel","email","password","number","date","month","week","time","datetime-local"]),ve=new Set(["TEXTAREA"]);function Ee(e){let t=e.getAttribute("contenteditable");return t===null?!1:t.trim().toLowerCase()!=="false"}function M(e){if(Ee(e))return"focus";let t=e.tagName;if(t==="INPUT"){let o=(e.getAttribute("type")??"text").trim().toLowerCase();return we.has(o)?"focus":"click"}if(ve.has(t))return"focus";let n=e.getAttribute("role");return n!==null&&B.includes(n.trim().toLowerCase())?"focus":"click"}function ke(e){let t=e;if(typeof t.checkVisibility=="function")return t.checkVisibility();let n=t.ownerDocument?.defaultView;return t.offsetParent!==null||n?.getComputedStyle(t).position==="fixed"}function Re(e,t,n){let o=e.ownerDocument?.defaultView;if(o==null)return;let r=(i,c)=>new o.MouseEvent(i,{bubbles:!0,cancelable:!0,clientX:t,clientY:n,button:0,buttons:c}),a=o.PointerEvent,s=(i,c)=>a===void 0?r(i,c):new a(i,{bubbles:!0,cancelable:!0,clientX:t,clientY:n,button:0,buttons:c,pointerId:1,pointerType:"mouse",isPrimary:!0});e.dispatchEvent(s("pointerdown",1)),e.dispatchEvent(r("mousedown",1)),e.dispatchEvent(s("pointerup",0)),e.dispatchEvent(r("mouseup",0)),e.dispatchEvent(r("click",0))}function Se(e,t){let n=e;if(typeof n.focus!="function"||t.activeElement===e||(n.focus(),t.activeElement!==e))return;let o=t.getSelection?.()??null;if(o===null)return;let r=t.createRange();r.selectNodeContents(e),r.collapse(!1),o.removeAllRanges(),o.addRange(r)}function Be(){return globalThis.navigator?.platform??""}function I(e={}){let t=e.window??globalThis,n={...L,...e.config},o=e.isVisible??ke,r=e.platform??w(Be()),a=h(r),s=e.bindings??{get:()=>a},i=H({doc:t.document,viewport:()=>({width:t.innerWidth,height:t.innerHeight})});function c(){let l=P(()=>Array.from(t.document.querySelectorAll(n.candidateSelector)),{width:t.innerWidth,height:t.innerHeight},{isVisible:o});return i.render(l),l}return{apply(){let l=_(),u=[],m=d=>{let E=l.pending,Z={key:d.key,metaKey:d.metaKey,ctrlKey:d.ctrlKey,altKey:d.altKey,shiftKey:d.shiftKey,isComposing:d.isComposing},Q=l.mode!=="idle",g=D(l,Z,u.map(y=>y.label),s.get());if((Q||g.type!=="ignore")&&(d.preventDefault(),d.stopPropagation()),g.type==="ignore"){l.pending!==E&&i.render(u,l.pending);return}if(g.type==="activate-click"||g.type==="activate-focus"){u=c();return}if(g.type==="exit"){u=[],i.destroy();return}if(l.pending!==E&&i.render(u,l.pending),l.pending!=="")return;let ee=E+g.key,p=u.find(y=>y.label===ee);u=[],i.destroy();let te=l.mode;if(l.mode="idle",p===void 0)return;let ne=p.rect.x+p.rect.w/2,ie=p.rect.y+p.rect.h/2;if(M(p.element)==="focus")Se(p.element,t.document);else if(te==="click")Re(p.element,ne,ie);else{let y=p.element;typeof y.focus=="function"&&y.focus()}};return t.addEventListener("keydown",m,{capture:!0}),()=>{t.removeEventListener("keydown",m,{capture:!0}),i.destroy(),u=[]}}}}var Je={title:"\u8DF3\u8DC3\u5BFC\u822A\u5FEB\u6377\u952E",description:"\u6309\u4E0B\u7EC4\u5408\u952E\u540E\uFF0C\u7528\u5B57\u6BCD\u6807\u7B7E\u9009\u4E2D\u70B9\u51FB\u6216\u805A\u7126\u76EE\u6807\u3002",recording:"\u6309\u4E0B\u7EC4\u5408\u952E",recordingHint:"Esc \u53D6\u6D88",reset:"\u6062\u590D\u9ED8\u8BA4",clickName:"\u70B9\u51FB\u6A21\u5F0F\u7684\u5FEB\u6377\u952E",focusName:"\u805A\u7126\u6A21\u5F0F\u7684\u5FEB\u6377\u952E",issues:{"no-modifier":"\u9700\u8981\u4E00\u4E2A \u2318 \u6216 \u2303 \u6216 \u2325 \u4FEE\u9970\u952E","reserved-key":"\u8FD9\u4E2A\u952E\u88AB\u754C\u9762\u5360\u7528\u4E86",duplicate:"\u5DF2\u7ECF\u5206\u914D\u7ED9\u53E6\u4E00\u4E2A\u6A21\u5F0F"}},Ce={title:"Jump navigation shortcuts",description:"Press a chord, then type a label to click or focus a target.",recording:"Press a chord",recordingHint:"Esc to cancel",reset:"Restore defaults",clickName:"Click-mode shortcut",focusName:"Focus-mode shortcut",issues:{"no-modifier":"Needs a \u2318, \u2303 or \u2325 modifier","reserved-key":"That key belongs to the interface",duplicate:"Already bound to the other mode"}};function N(e){return e.toLowerCase().startsWith("en")?Ce:Je}var Ke=new Set(["Meta","Control","Alt","Shift","AltGraph","CapsLock","OS"]);function W(e,t,n){if(e.key==="Escape")return{status:"cancel"};if(Ke.has(e.key)||e.isComposing)return{status:"pending"};let o=x({key:e.key,meta:e.metaKey,alt:e.altKey,ctrl:e.ctrlKey,shift:e.shiftKey},{key:e.key,meta:!1,alt:!1,ctrl:!1,shift:!1},n),r=A(o,t);return r!==null?{status:"rejected",issue:r}:{status:"accepted",binding:o}}function Ae(e,t){return[t==="click"?e.focus:e.click]}function Y(e){let{store:t,platform:n}=e,o=new Set,r={bindings:t.get(),recording:null,issue:null},a=s=>{if(!(s.bindings===r.bindings&&s.recording===r.recording&&s.issue===r.issue)){r=s;for(let i of o)i(r)}};return t.subscribe(s=>{a({...r,bindings:s,issue:null})}),{getState:()=>r,begin(s){a({...r,recording:s,issue:null})},press(s){let i=r.recording;if(i===null)return"idle";let c=W(s,Ae(r.bindings,i),n);return c.status==="pending"?"pending":c.status==="cancel"?(a({...r,recording:null,issue:null}),"cancelled"):c.status==="rejected"?(a({...r,issue:c.issue}),"rejected"):(t.set({...r.bindings,[i]:c.binding}),a({...r,bindings:t.get(),recording:null,issue:null}),"saved")},reset(){t.reset(),a({bindings:t.get(),recording:null,issue:null})},subscribe(s){return o.add(s),()=>{o.delete(s)}}}}var Te=`
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
`,G="dsh-jump/settings.css";function z(e){let t=`style[data-plugin-css=${JSON.stringify(G)}]`;if(e.querySelector(t)!==null)return()=>{};let n=e.createElement("style");return n.dataset.plugin="dsh-jump",n.dataset.pluginCss=G,n.textContent=Te,e.head.append(n),()=>n.remove()}function V(e){let{React:t,action:n,state:o,copy:r,platform:a,onBegin:s}=e,i=o.recording===n,c=o.bindings[n],l=T(c,a);return t.createElement("button",{type:"button","data-dsh-jump-chord":n,"data-recording":i?"":void 0,"aria-label":n==="click"?r.clickName:r.focusName,"aria-keyshortcuts":l,onClick:()=>{s(n)}},i?r.recording:l)}function q(e){let{React:t,controller:n,platform:o,copy:r}=e,a=t.useSyncExternalStore(i=>n.subscribe(()=>i()),()=>n.getState());Le(t,a.recording,i=>{n.press({key:i.key,metaKey:i.metaKey,ctrlKey:i.ctrlKey,altKey:i.altKey,shiftKey:i.shiftKey,isComposing:i.isComposing})});let s=a.issue===null?null:r.issues[a.issue];return t.createElement("div",{"data-dsh-jump-settings":""},t.createElement("div",{"data-dsh-jump-text":""},t.createElement("div",{"data-dsh-jump-title":""},r.title),t.createElement("p",{"data-dsh-jump-description":""},a.recording===null?r.description:r.recordingHint),s===null?null:t.createElement("p",{"data-dsh-jump-issue":"",role:"status"},s)),t.createElement("div",{"data-dsh-jump-actions":""},V({React:t,action:"click",state:a,copy:r,platform:o,onBegin:i=>n.begin(i)}),V({React:t,action:"focus",state:a,copy:r,platform:o,onBegin:i=>n.begin(i)}),t.createElement("button",{type:"button","data-dsh-jump-reset":"",onClick:()=>n.reset()},r.reset)))}function Le(e,t,n){let o=e.useRef(n);o.current=n,e.useEffect(()=>{if(t===null)return;let r=s=>{s.preventDefault(),s.stopPropagation(),o.current(s)},a=globalThis.document;return a.addEventListener("keydown",r,{capture:!0}),()=>{a.removeEventListener("keydown",r,{capture:!0})}},[t])}var J="dsh-jump:bindings:v1";function je(e,t){return v(e.click,t.click)&&v(e.focus,t.focus)}function Pe(){try{return globalThis.localStorage??null}catch{return null}}function F(e){let t=h(e.platform),n=e.storage===void 0?Pe():e.storage,o=new Set,r=()=>{if(n===null)return t;try{let i=n.getItem(J);return i===null?t:R(JSON.parse(i),e.platform)}catch{return t}},a=r(),s=i=>{if(!je(a,i)){a=i;for(let c of o)c(a)}};return{get:()=>a,set(i){if(s(R(i,e.platform)),n!==null)try{n.setItem(J,JSON.stringify(a))}catch{}},reset(){if(s(t),n!==null)try{n.removeItem(J)}catch{}},reload(){s(r())},subscribe(i){return o.add(i),()=>{o.delete(i)}}}}var U="settings.general.item",Oe="jump",_e=17;function X(e){let{ctx:t,platform:n,React:o,config:r}=e,a=e.store??F({platform:n}),s=I({config:r,bindings:a,platform:n,window:e.window}),i=[s.apply()],c=t.get("slots");if(o!==null&&c!==void 0){let l=t.get("locale"),u=Y({store:a,platform:n});i.push(c.inject(U,()=>c.register({name:U,id:Oe,order:_e},()=>q({React:o,controller:u,platform:n,copy:N(l?.getSnapshot().active??"zh")}))));let m=e.document??globalThis.document;m!==void 0&&i.push(z(m))}return{store:a,app:s,dispose(){for(;i.length>0;)i.pop()?.()}}}var C=null;function De(){return w(globalThis.navigator?.platform??"")}function He(){if(C===null)return null;let e=C("react");for(let t of["createElement","useEffect","useRef","useSyncExternalStore"])if(typeof e?.[t]!="function")return null;return e}var $={name:"dsh-jump",inject:[],apply(e,t){let n=X({ctx:e,platform:De(),React:He(),config:t});return()=>n.dispose()}};function Me(e){C=e}var Ie=$;

module.exports.boot(require);
    return module.exports.default ?? module.exports;
  }
});
