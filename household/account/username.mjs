// Passwords exist only in the request and never enter application storage.
export async function signInWithUsername(auth,_endpoint,username,password){
  return auth.signInWithUsername({username:username.trim(),password});
}
