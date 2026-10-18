// Optional Supabase bridge. Game stays fully playable without cloud configuration.
const cfg=window.BLOQVEX_CONFIG||{};
export const configured=Boolean(cfg.SUPABASE_URL?.startsWith('https://')&&cfg.SUPABASE_ANON_KEY?.trim());
export let db=null;export let account=null;export let player=null;
export async function initializeCloud(onAuthChange){
  if(!configured)return false;
  try{
    const {createClient}=await import('https://esm.sh/@supabase/supabase-js@2.49.4');
    db=createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
    const {data:{session}}=await db.auth.getSession();account=session?.user||null;
    if(account)await refreshProfile();
    db.auth.onAuthStateChange((_event,session)=>{
      account=session?.user||null;
      // Async callback deferred to avoid deadlock with Supabase auth lock.
      setTimeout(async()=>{try{if(account)await refreshProfile();else player=null;onAuthChange?.();}catch(e){console.warn('Profile refresh:',e.message);}},0);
    });
    return true;
  }catch(e){console.warn('Cloud connection failed:',e);return false;}
}
export async function refreshProfile(){if(!db||!account)return null;const {data,error}=await db.from('profiles').select('*').eq('id',account.id).single();if(error)throw error;player=data;return player;}
export async function signUp(email,password,nickname){if(!db)throw new Error('Cloud not configured');const {data,error}=await db.auth.signUp({email,password,options:{data:{nickname}}});if(error)throw error;return data;}
export async function signIn(email,password){if(!db)throw new Error('Cloud not configured');const {data,error}=await db.auth.signInWithPassword({email,password});if(error)throw error;return data;}
export async function signOut(){if(!db)return;const {error}=await db.auth.signOut();if(error)throw error;account=null;player=null;}
export async function rpc(name,args={}){if(!db||!account)throw new Error('Please sign in first / سجّل الدخول أولاً');const {data,error}=await db.rpc(name,args);if(error)throw error;return data;}
export async function saveProfile(nickname,country){const result=await rpc('update_my_profile',{p_nickname:nickname,p_country:country});await refreshProfile();return result;}
export async function claimReward(){const data=await rpc('claim_daily_reward');await refreshProfile();return data;}
export async function buyTheme(theme){const data=await rpc('buy_theme',{p_theme:theme});await refreshProfile();return data;}
export async function saveScore(mode,points,lines,combo){return rpc('submit_score',{p_mode:mode,p_points:points,p_lines:lines,p_combo:combo});}
export async function leaderboard(mode,country='ALL'){if(!db)return [];let query=db.from('scores').select(country==='ALL'?'id,mode,points,lines,created_at,profiles(nickname,country)':'id,mode,points,lines,created_at,profiles!inner(nickname,country)').eq('mode',mode);if(country!=='ALL')query=query.eq('profiles.country',country);const {data,error}=await query.order('points',{ascending:false}).limit(100);if(error)throw error;const distinct=[];const names=new Set();for(const s of data||[]){const key=s.profiles?.nickname||s.id;if(!names.has(key)){names.add(key);distinct.push(s);}if(distinct.length>=25)break;}return distinct;}
export async function findPlayers(q){const {data,error}=await db.from('profiles').select('id,nickname,country').ilike('nickname',`%${q.replace(/[%,()]/g,'')}%`).limit(15);if(error)throw error;return data.filter(x=>x.id!==account?.id);}
export async function getFriendRequests(){const {data,error}=await db.from('friend_requests').select('id,sender_id,receiver_id,status,created_at').or(`sender_id.eq.${account.id},receiver_id.eq.${account.id}`).order('created_at',{ascending:false});if(error)throw error;return data;}
export async function sendFriendRequest(id){return rpc('send_friend_request',{p_target:id});}
export async function respondFriendRequest(id,accept){return rpc('respond_friend_request',{p_request:id,p_accept:accept});}
export async function getProfiles(ids){if(!ids.length)return [];const {data,error}=await db.from('profiles').select('id,nickname,country').in('id',ids);if(error)throw error;return data;}
export async function messages(friendId){const {data,error}=await db.from('messages').select('id,sender_id,receiver_id,body,created_at').or(`and(sender_id.eq.${account.id},receiver_id.eq.${friendId}),and(sender_id.eq.${friendId},receiver_id.eq.${account.id})`).order('created_at',{ascending:true}).limit(50);if(error)throw error;return data;}
export async function sendMessage(friendId,body){const {error}=await db.from('messages').insert({sender_id:account.id,receiver_id:friendId,body:body.slice(0,500)});if(error)throw error;}
export async function createRoom(){return rpc('create_battle_room');}
export async function joinRoom(code){return rpc('join_battle_room',{p_code:code.toUpperCase()});}
export async function roomStatus(id){if(!db||!account)return null;const {data,error}=await db.from('rooms').select('id,code,seed,state,started_at,finished_at').eq('id',id).single();if(error)throw error;const {data:members,error:memberError}=await db.from('room_members').select('user_id,score,lines,joined_at').eq('room_id',id).order('joined_at',{ascending:true});if(memberError)throw memberError;const profiles=await getProfiles(members.map(m=>m.user_id));return {...data,members:members.map(m=>({...m,profile:profiles.find(p=>p.id===m.user_id)}))};}
export async function postBattleProgress(id,score,lines){return rpc('report_battle_progress',{p_room:id,p_score:score,p_lines:lines});}
export async function leaveRoom(id){return rpc('leave_battle_room',{p_room:id});}
export async function myNotifications(){if(!db||!account)return [];const {data,error}=await db.from('notifications').select('id,body,created_at').or(`target_id.is.null,target_id.eq.${account.id}`).order('created_at',{ascending:false}).limit(5);if(error)throw error;return data;}
export async function adminNotifications(){const {data,error}=await db.from('notifications').select('id,body,created_at,target_id').order('created_at',{ascending:false}).limit(15);if(error)throw error;return data;}
export async function adminSend(body,target){const {error}=await db.from('notifications').insert({body,target_id:target||null,created_by:account.id});if(error)throw error;}
