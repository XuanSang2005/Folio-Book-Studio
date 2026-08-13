export function validateIdentity(name: string, email: string) {
  if (!name.trim()) return "Enter your full name to continue.";
  if (!/^\S+@\S+\.\S+$/.test(email.trim())) return "Enter a valid email address to continue.";
  return "";
}
