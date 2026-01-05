import { observer } from 'mobx-react-lite';
import { BottomSheet } from '../layout';
import { playerStore, type PlayerSkill } from '../../stores/playerStore';

export const SkillsSheet = observer(() => {
  const skillsByCategory = playerStore.skills.reduce(
    (acc, skill) => {
      if (!acc[skill.category]) acc[skill.category] = [];
      acc[skill.category].push(skill);
      return acc;
    },
    {} as Record<string, PlayerSkill[]>
  );

  const categoryLabels: Record<string, string> = {
    gathering: 'Gathering',
    combat: 'Combat',
    crafting: 'Crafting',
    support: 'Support',
  };

  return (
    <BottomSheet id="skills" title="Skills">
      <div className="space-y-4">
        {Object.entries(skillsByCategory).map(([category, skills]) => (
          <div key={category}>
            <h3 className="text-accent text-sm font-medium mb-2">
              {categoryLabels[category] || category}
            </h3>
            <div className="space-y-2">
              {skills.map((skill) => (
                <SkillCard key={skill.id} skill={skill} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </BottomSheet>
  );
});

function SkillCard({ skill }: { skill: PlayerSkill }) {
  const progress = (skill.xp / skill.xpToNext) * 100;

  return (
    <div className="bg-app-tertiary rounded-lg p-3">
      <div className="flex justify-between items-center mb-1">
        <span className="text-app-primary">{skill.name}</span>
        <span className="text-accent font-bold">{skill.level}</span>
      </div>
      <div className="h-2 bg-app-primary rounded-full overflow-hidden">
        <div
          className="h-full bg-accent transition-all"
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="text-app-muted text-xs mt-1">
        {skill.xp.toLocaleString()} / {skill.xpToNext.toLocaleString()} XP
      </div>
    </div>
  );
}
