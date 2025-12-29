import { observer } from 'mobx-react-lite';
import { useNavigate } from 'react-router-dom';
import { authStore } from '../stores/authStore';

export const HomePage = observer(() => {
  const navigate = useNavigate();

  const handleLogout = () => {
    authStore.logout();
    navigate('/login');
  };

  if (!authStore.player) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-900 p-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <header className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-2xl font-bold text-amber-400">
              Idle Adventures
            </h1>
            <p className="text-gray-400">Welcome, {authStore.player.username}</p>
          </div>
          <button
            onClick={handleLogout}
            className="text-gray-400 hover:text-white"
          >
            Logout
          </button>
        </header>

        {/* Player Info Card */}
        <div className="bg-gray-800 rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold text-white mb-4">Your Profile</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <span className="text-gray-400">Username</span>
              <p className="text-white text-lg">{authStore.player.username}</p>
            </div>
            <div>
              <span className="text-gray-400">Gold</span>
              <p className="text-amber-400 text-lg">
                {authStore.player.gold} gold
              </p>
            </div>
          </div>
        </div>

        {/* Placeholder sections */}
        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-gray-800 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-white mb-2">
              Expeditions
            </h3>
            <p className="text-gray-400 mb-4">
              Venture out to gather resources and level up your skills.
            </p>
            <button
              disabled
              className="bg-gray-600 text-gray-400 py-2 px-4 rounded cursor-not-allowed"
            >
              Coming in Sprint 2
            </button>
          </div>

          <div className="bg-gray-800 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-white mb-2">
              Inventory
            </h3>
            <p className="text-gray-400 mb-4">
              View your items and equipment.
            </p>
            <button
              disabled
              className="bg-gray-600 text-gray-400 py-2 px-4 rounded cursor-not-allowed"
            >
              Coming in Sprint 1
            </button>
          </div>

          <div className="bg-gray-800 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-white mb-2">Skills</h3>
            <p className="text-gray-400 mb-4">
              Track your 23 skills and their progress.
            </p>
            <button
              disabled
              className="bg-gray-600 text-gray-400 py-2 px-4 rounded cursor-not-allowed"
            >
              Coming in Sprint 1
            </button>
          </div>

          <div className="bg-gray-800 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-white mb-2">Crafting</h3>
            <p className="text-gray-400 mb-4">
              Process materials and craft gear.
            </p>
            <button
              disabled
              className="bg-gray-600 text-gray-400 py-2 px-4 rounded cursor-not-allowed"
            >
              Coming in Sprint 6
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});
