export function generateLocalAvatar(name: string): string {
  // Hash the name to pick a consistent avatar for the same name
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  // We have 9 downloaded anime avatars in public/avatars/key1.jpg to key9.jpg
  const avatarIndex = (Math.abs(hash) % 9) + 1;
  return `./avatars/key${avatarIndex}.jpg`;
}
