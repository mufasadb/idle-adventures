package gamedata

import "math"

// XP thresholds follow a curve similar to RuneScape
// Level 1 = 0 XP, Level 99 = ~13 million XP
// Formula: XP needed for level L = sum of floor(L + 300 * 2^(L/7)) / 4 for all levels up to L

// Pre-calculated XP thresholds for levels 1-99
var xpForLevel = []int64{
	0,          // Level 1
	83,         // Level 2
	174,        // Level 3
	276,        // Level 4
	388,        // Level 5
	512,        // Level 6
	650,        // Level 7
	801,        // Level 8
	969,        // Level 9
	1154,       // Level 10
	1358,       // Level 11
	1584,       // Level 12
	1833,       // Level 13
	2107,       // Level 14
	2411,       // Level 15
	2746,       // Level 16
	3115,       // Level 17
	3523,       // Level 18
	3973,       // Level 19
	4470,       // Level 20
	5018,       // Level 21
	5624,       // Level 22
	6291,       // Level 23
	7028,       // Level 24
	7842,       // Level 25
	8740,       // Level 26
	9730,       // Level 27
	10824,      // Level 28
	12031,      // Level 29
	13363,      // Level 30
	14833,      // Level 31
	16456,      // Level 32
	18247,      // Level 33
	20224,      // Level 34
	22406,      // Level 35
	24815,      // Level 36
	27473,      // Level 37
	30408,      // Level 38
	33648,      // Level 39
	37224,      // Level 40
	41171,      // Level 41
	45529,      // Level 42
	50339,      // Level 43
	55649,      // Level 44
	61512,      // Level 45
	67983,      // Level 46
	75127,      // Level 47
	83014,      // Level 48
	91721,      // Level 49
	101333,     // Level 50
	111945,     // Level 51
	123660,     // Level 52
	136594,     // Level 53
	150872,     // Level 54
	166636,     // Level 55
	184040,     // Level 56
	203254,     // Level 57
	224466,     // Level 58
	247886,     // Level 59
	273742,     // Level 60
	302288,     // Level 61
	333804,     // Level 62
	368599,     // Level 63
	407015,     // Level 64
	449428,     // Level 65
	496254,     // Level 66
	547953,     // Level 67
	605032,     // Level 68
	668051,     // Level 69
	737627,     // Level 70
	814445,     // Level 71
	899257,     // Level 72
	992895,     // Level 73
	1096278,    // Level 74
	1210421,    // Level 75
	1336443,    // Level 76
	1475581,    // Level 77
	1629200,    // Level 78
	1798808,    // Level 79
	1986068,    // Level 80
	2192818,    // Level 81
	2421087,    // Level 82
	2673114,    // Level 83
	2951373,    // Level 84
	3258594,    // Level 85
	3597792,    // Level 86
	3972294,    // Level 87
	4385776,    // Level 88
	4842295,    // Level 89
	5346332,    // Level 90
	5902831,    // Level 91
	6517253,    // Level 92
	7195629,    // Level 93
	7944614,    // Level 94
	8771558,    // Level 95
	9684577,    // Level 96
	10692629,   // Level 97
	11805606,   // Level 98
	13034431,   // Level 99
}

const MaxLevel = 99

// LevelFromXP calculates the level for a given amount of XP
func LevelFromXP(xp int64) int {
	for level := MaxLevel; level >= 1; level-- {
		if xp >= xpForLevel[level-1] {
			return level
		}
	}
	return 1
}

// XPForLevel returns the total XP required to reach a given level
func XPForLevel(level int) int64 {
	if level < 1 {
		return 0
	}
	if level > MaxLevel {
		level = MaxLevel
	}
	return xpForLevel[level-1]
}

// XPToNextLevel returns XP needed to reach the next level
func XPToNextLevel(currentXP int64) int64 {
	currentLevel := LevelFromXP(currentXP)
	if currentLevel >= MaxLevel {
		return 0
	}
	return XPForLevel(currentLevel+1) - currentXP
}

// ProgressToNextLevel returns a value between 0.0 and 1.0
func ProgressToNextLevel(currentXP int64) float64 {
	currentLevel := LevelFromXP(currentXP)
	if currentLevel >= MaxLevel {
		return 1.0
	}

	currentLevelXP := XPForLevel(currentLevel)
	nextLevelXP := XPForLevel(currentLevel + 1)
	xpIntoLevel := currentXP - currentLevelXP
	xpNeeded := nextLevelXP - currentLevelXP

	return math.Min(1.0, float64(xpIntoLevel)/float64(xpNeeded))
}

// SkillInfo represents calculated skill information
type SkillInfo struct {
	Level           int     `json:"level"`
	CurrentXP       int64   `json:"current_xp"`
	XPToNextLevel   int64   `json:"xp_to_next_level"`
	ProgressPercent float64 `json:"progress_percent"`
}

// CalculateSkillInfo returns full skill info from XP
func CalculateSkillInfo(xp int64) SkillInfo {
	return SkillInfo{
		Level:           LevelFromXP(xp),
		CurrentXP:       xp,
		XPToNextLevel:   XPToNextLevel(xp),
		ProgressPercent: ProgressToNextLevel(xp) * 100,
	}
}
