// DIU WorkSync - Pure JS Database (localStorage)
const DB={
  init(){
    if(!localStorage.getItem("diu_ws_init")){
      const u=[{id:1,name:"Demo Teacher",email:"teacher@diu.edu.bd",password:"password",role:"teacher",phone:"",github:""},{id:2,name:"Demo Student",email:"student@diu.edu.bd",password:"password",role:"student",phone:"",github:""}];
      const c=[{id:1,code:"CSE-307",name:"Web Engineering",semester:"Spring 2026",teacherId:1}];
      const cs=[{courseId:1,studentId:2}];
      const t=[{id:1,title:"Database Design",description:"Create ER diagram and normalize tables",type:"Group Project",courseId:1,teacherId:1,priority:"High",status:"Active",deadline:"2026-09-15"},{id:2,title:"Frontend Development",description:"Build responsive UI with HTML/CSS/JS",type:"Group Project",courseId:1,teacherId:1,priority:"High",status:"Active",deadline:"2026-09-20"},{id:3,title:"Backend API",description:"Create REST API with MySQL",type:"Group Project",courseId:1,teacherId:1,priority:"Medium",status:"Active",deadline:"2026-09-25"},{id:4,title:"Documentation",description:"Write project documentation",type:"Group Project",courseId:1,teacherId:1,priority:"Low",status:"Active",deadline:"2026-09-28"}];
      const pm=[{projectId:1,studentId:2,role:"Member"}];
      const ta=[{id:1,taskId:1,projectId:1,studentId:2,weightPercent:25,status:"In Progress",deadline:"2026-09-15"},{id:2,taskId:2,projectId:1,studentId:2,weightPercent:30,status:"Not Started",deadline:"2026-09-20"},{id:3,taskId:3,projectId:1,studentId:2,weightPercent:30,status:"Not Started",deadline:"2026-09-25"},{id:4,taskId:4,projectId:1,studentId:2,weightPercent:15,status:"Not Started",deadline:"2026-09-28"}];
      const p=[{id:1,title:"University Event Management System",description:"Build a complete event management platform",courseId:1,teacherId:1,status:"Active"}];
      const ans=[{id:1,courseId:1,title:"Project Deadline Extended",message:"Final project deadline extended to September 30.",postedBy:1,postedAt:new Date().toISOString()}];
      const acts=[{id:1,userId:2,action:"Logged in",entityType:"user",entityId:2,loggedAt:new Date().toISOString()}];
      DB.save("users",u);DB.save("courses",c);DB.save("course_students",cs);DB.save("projects",p);DB.save("project_members",pm);DB.save("tasks",t);DB.save("task_assignments",ta);DB.save("announcements",ans);DB.save("activities",acts);DB.save("submissions",[]);DB.save("task_reviews",[]);DB.save("notifications",[]);DB.save("comments",[]);DB.save("peer_reviews",[]);DB.save("adjustments",[]);
      localStorage.setItem("diu_ws_init","true");
    }
  },
  get:function(t){return JSON.parse(localStorage.getItem("diu_ws_"+t)||"[]")},
  save:function(t,d){localStorage.setItem("diu_ws_"+t,JSON.stringify(d))},
  add:function(t,item){const d=DB.get(t);item.id=d.length?Math.max(...d.map(x=>x.id))+1:1;d.push(item);DB.save(t,d);return item},
  update:function(t,id,u){const d=DB.get(t);const i=d.findIndex(x=>x.id===id);if(i!==-1){d[i]={...d[i],...u};DB.save(t,d)}},
  delete:function(t,id){DB.save(t,DB.get(t).filter(x=>x.id!==id))}
};

const Session={
  login:function(email,password){
    const u=DB.get("users");
    const user=u.find(x=>x.email===email&&x.password===password);
    if(user){
      localStorage.setItem("diu_ws_session",JSON.stringify({id:user.id,name:user.name,email:user.email,role:user.role}));
      DB.add("activities",{userId:user.id,action:"Logged in",entityType:"user",entityId:user.id,loggedAt:new Date().toISOString()});
      return true;
    }
    return false;
  },
  logout:function(){localStorage.removeItem("diu_ws_session");window.location.href="index.html"},
  get:function(){return JSON.parse(localStorage.getItem("diu_ws_session"))},
  isAuthenticated:function(){return!!this.get()},
  isTeacher:function(){return this.get()?.role==="teacher"},
  isStudent:function(){return this.get()?.role==="student"}
};

function $(s){return document.querySelector(s)}
function $$(s){return document.querySelectorAll(s)}
function apiFetch(path,opts={}){
  const sess=Session.get();
  const cookie=sess?"session="+btoa(JSON.stringify({userId:sess.id,name:sess.name,role:sess.role})):"";
  return fetch("/api"+path,{headers:{"Content-Type":"application/json","Cookie":cookie},...opts}).then(r=>r.json());
}
function formatDate(d){if(!d)return"-";return new Date(d).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}
function formatDateTime(d){if(!d)return"-";return new Date(d).toLocaleString()}
function escapeHtml(s){if(!s)return"";return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;")}
function getStatusClass(s){const m={"Not Started":"badge-notstarted","In Progress":"badge-inprogress","Completed":"badge-completed","Overdue":"badge-overdue","Approved":"badge-approved","Rejected":"badge-rejected","Revision Requested":"badge-revision","Pending":"badge-pending","Active":"badge-active"};return m[s]||"badge-pending"}
function getPriorityClass(p){return{"High":"priority-high","Medium":"priority-medium","Low":"priority-low"}[p]||""}
function daysUntil(d){if(!d)return 999;return Math.ceil((new Date(d)-new Date())/86400000)}
function showModal(id){const el=document.getElementById(id);if(el)el.classList.add("active")}
function hideModal(id){const el=document.getElementById(id);if(el)el.classList.remove("active")}
function showNotif(msg,type="info"){
  const div=document.createElement("div");
  div.className="alert alert-"+type;
  div.textContent=msg;
  const c=document.querySelector(".main-content")||document.body;
  c.insertBefore(div,c.firstChild);
  setTimeout(()=>div.remove(),4000);
}
function requireAuth(redir){if(!Session.isAuthenticated()){window.location.href=redir||"index.html"}}
function requireRole(role){
  requireAuth("index.html");
  if(role==="teacher"&&!Session.isTeacher())window.location.href="pages/student/dashboard.html";
  if(role==="student"&&!Session.isStudent())window.location.href="pages/teacher/dashboard.html";
}
function initSidebar(){
  const h=$("#hamburgerBtn"),s=$("#sidebar"),o=$("#sidebarOverlay");
  if(h&&s){
    h.addEventListener("click",()=>{s.classList.toggle("open");if(o)o.classList.toggle("show")});
    if(o){
      document.addEventListener("click",(e)=>{
        if(!s.contains(e.target)&&!h.contains(e.target)){s.classList.remove("open");o.classList.remove("show")}
      });
      o.addEventListener("click",()=>{s.classList.remove("open");o.classList.remove("show")});
    }
  }
}
function updateNotifBadge(){
  const s=Session.get();if(!s)return;
  const n=DB.get("notifications").filter(x=>x.userId===s.id&&!x.read);
  const b=$("#notifBadge");
  if(b){b.textContent=n.length||"";b.style.display=n.length?"inline":"none"}
}
function initTheme(){
  const t=$("#themeToggle"),i=t?.querySelector("i"),s=localStorage.getItem("diu_ws_theme");
  if(s==="dark"){document.body.classList.add("dark-mode");if(i){i.classList.replace("fa-moon","fa-sun")}}
  if(t){
    t.addEventListener("click",()=>{
      document.body.classList.toggle("dark-mode");
      const d=document.body.classList.contains("dark-mode");
      localStorage.setItem("diu_ws_theme",d?"dark":"light");
      if(i){i.classList.toggle("fa-moon",!d);i.classList.toggle("fa-sun",d)}
    });
  }
}
function chr(n){return String.fromCharCode(n)}
function exportCSV(fn,headers,rows){
  let csv=headers.join(",")+"\n";
  rows.forEach(r=>{csv+=r.map(function(v){return chr(34)+String(v).replace(/"/g,chr(34)+chr(34))+chr(34)}).join(",")+"\n"});
  const blob=new Blob([csv],{type:"text/csv"});
  const a=document.createElement("a");
  a.href=URL.createObjectURL(blob);
  a.download=fn;
  a.click();
}
document.addEventListener("DOMContentLoaded",()=>{
  DB.init();
  initSidebar();
  initTheme();
  updateNotifBadge();
});
