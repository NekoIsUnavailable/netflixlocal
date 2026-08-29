import { useState, useEffect } from 'react';
import { Plus, Edit2 } from 'lucide-react';

export interface Profile {
  id: string;
  name: string;
  color: string;
  avatar: string;
}

const createLocalAvatar = (name: string, color: string) => {
  void name;
  void color;
  return '/icons.svg';
};

export const DEFAULT_PROFILES: Profile[] = [
  { id: '1', name: 'John', color: '#E50914', avatar: createLocalAvatar('John', '#E50914') },
  { id: '2', name: 'Guest', color: '#0071eb', avatar: createLocalAvatar('Guest', '#0071eb') }
];

export function ProfilesScreen({ onSelect }: { onSelect: (id: string) => void }) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [editingMode, setEditingMode] = useState(false);
  const [editingProfile, setEditingProfile] = useState<Profile | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem('netflix_profiles');
    if (saved) {
      setProfiles(JSON.parse(saved));
    } else {
      setProfiles(DEFAULT_PROFILES);
      localStorage.setItem('netflix_profiles', JSON.stringify(DEFAULT_PROFILES));
    }
  }, []);

  const saveProfile = (p: Profile) => {
    let updated = [...profiles];
    if (profiles.find(x => x.id === p.id)) {
      updated = updated.map(x => x.id === p.id ? p : x);
    } else {
      updated.push(p);
    }
    setProfiles(updated);
    localStorage.setItem('netflix_profiles', JSON.stringify(updated));
    setEditingProfile(null);
  };

  const deleteProfile = (id: string) => {
    const updated = profiles.filter(x => x.id !== id);
    setProfiles(updated);
    localStorage.setItem('netflix_profiles', JSON.stringify(updated));
    setEditingProfile(null);
  };

  if (editingProfile) {
    return (
      <div className='fixed inset-0 z-[400] bg-[#141414] flex flex-col items-center justify-center'>
        <h1 className='text-4xl md:text-5xl font-bold text-white mb-12 tracking-tight'>Edit Profile</h1>
        <div className='flex flex-col md:flex-row items-start gap-8'>
          <div 
            className='w-32 h-32 md:w-40 md:h-40 rounded bg-gray-800 overflow-hidden border-4 border-transparent'
            style={{ backgroundColor: editingProfile.color }}
          >
            <img src="/icons.svg" alt={editingProfile.name} className='w-full h-full object-cover' />
          </div>
          <div className='flex flex-col gap-4'>
            <input 
              type="text" 
              value={editingProfile.name}
              onChange={e => setEditingProfile({
                ...editingProfile,
                name: e.target.value
              })}
              className='bg-gray-600 text-white px-4 py-2 text-xl font-semibold outline-none focus:ring-2 focus:ring-white rounded'
              placeholder="Name"
            />
            <div className='flex items-center gap-2 mt-2'>
              <span className='text-gray-400'>Color:</span>
              <input 
                type="color" 
                value={editingProfile.color}
                onChange={e => setEditingProfile({
                  ...editingProfile,
                  color: e.target.value
                })}
                className='w-10 h-10 rounded cursor-pointer border-none bg-transparent'
              />
            </div>
          </div>
        </div>
        <div className='flex gap-4 mt-12'>
          <button 
            onClick={() => saveProfile(editingProfile)}
            className='bg-white text-black px-6 py-2 rounded font-bold hover:bg-gray-200 transition text-xl'
          >
            Save
          </button>
          <button 
            onClick={() => setEditingProfile(null)}
            className='border border-gray-500 text-gray-400 px-6 py-2 rounded font-bold hover:text-white hover:border-white transition text-xl'
          >
            Cancel
          </button>
          {profiles.find(x => x.id === editingProfile.id) && profiles.length > 1 && (
            <button 
              onClick={() => deleteProfile(editingProfile.id)}
              className='border border-gray-500 text-gray-400 px-6 py-2 rounded font-bold hover:text-red-500 hover:border-red-500 transition text-xl'
            >
              Delete Profile
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className='fixed inset-0 z-[400] bg-[#141414] flex flex-col items-center justify-center'>
      <h1 className='text-4xl md:text-5xl font-bold text-white mb-12 tracking-tight'>
        {editingMode ? 'Manage Profiles' : "Who's watching?"}
      </h1>
      
      <div className='flex gap-8 flex-wrap justify-center items-start'>
        {profiles.map(p => (
          <div 
            key={p.id} 
            className='group flex flex-col items-center cursor-pointer relative'
            onClick={() => {
              if (editingMode) setEditingProfile(p);
              else onSelect(p.id);
            }}
          >
            <div 
              className={`w-32 h-32 md:w-40 md:h-40 rounded bg-gray-800 border-4 ${editingMode ? 'border-transparent opacity-50' : 'border-transparent group-hover:border-white'} transition overflow-hidden relative`}
              style={{ backgroundColor: p.color }}
            >
              <img src="/icons.svg" alt={p.name} className='w-full h-full object-cover opacity-90 group-hover:opacity-100' />
              {editingMode && (
                <div className='absolute inset-0 flex items-center justify-center bg-black/50'>
                  <Edit2 className='w-10 h-10 text-white' />
                </div>
              )}
            </div>
            <span className={`mt-4 text-gray-400 ${!editingMode && 'group-hover:text-white'} transition font-semibold`}>{p.name}</span>
          </div>
        ))}

        <div 
          className='group flex flex-col items-center cursor-pointer'
          onClick={() => {
            const color = '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');
            setEditingProfile({
              id: Date.now().toString(),
              name: 'New Profile',
              color,
              avatar: createLocalAvatar('New Profile', color)
            });
          }}
        >
          <div className='w-32 h-32 md:w-40 md:h-40 rounded border-2 border-gray-600 flex items-center justify-center group-hover:bg-gray-800 group-hover:text-white text-gray-600 transition'>
            <Plus className='w-16 h-16' />
          </div>
          <span className='mt-4 text-gray-400 group-hover:text-white transition font-semibold'>Add Profile</span>
        </div>
      </div>
      
      <button 
        onClick={() => setEditingMode(!editingMode)}
        className='mt-16 border border-gray-500 text-gray-400 px-6 py-2 rounded text-xl hover:text-white hover:border-white transition'
      >
        {editingMode ? 'Done' : 'Manage Profiles'}
      </button>
    </div>
  );
}
