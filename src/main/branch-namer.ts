import simpleGit from 'simple-git'

const NORWEGIAN_CITIES: readonly string[] = [
  'Oslo', 'Bergen', 'Trondheim', 'Stavanger', 'Drammen',
  'Fredrikstad', 'Kristiansand', 'Sandnes', 'Tromsø', 'Sarpsborg',
  'Bodø', 'Sandefjord', 'Ålesund', 'Larvik', 'Tønsberg',
  'Arendal', 'Haugesund', 'Porsgrunn', 'Skien', 'Moss',
  'Halden', 'Harstad', 'Molde', 'Lillehammer', 'Kongsberg',
  'Gjøvik', 'Horten', 'Narvik', 'Hammerfest', 'Alta',
  'Hamar', 'Elverum', 'Steinkjer', 'Namsos', 'Kristiansund',
  'Grimstad', 'Mandal', 'Flekkefjord', 'Egersund', 'Bryne',
  'Leirvik', 'Odda', 'Voss', 'Førde', 'Florø',
  'Ørsta', 'Volda', 'Ulsteinvik', 'Fosnavåg', 'Åndalsnes',
  'Sunndalsøra', 'Orkanger', 'Malvik', 'Verdal', 'Levanger',
  'Røros', 'Tynset', 'Mosjøen', 'Sandnessjøen', 'Mo',
  'Fauske', 'Sortland', 'Svolvær', 'Leknes', 'Stokmarknes',
  'Finnsnes', 'Bardufoss', 'Sjøvegan', 'Skånland', 'Kvæfjord',
  'Honningsvåg', 'Lakselv', 'Tana', 'Vadsø', 'Vardø',
  'Kirkenes', 'Kautokeino', 'Karasjok', 'Båtsfjord', 'Berlevåg',
  'Kongsvinger', 'Mysen', 'Askim', 'Ski', 'Ås',
  'Drøbak', 'Lillestrøm', 'Jessheim', 'Eidsvoll', 'Hønefoss',
  'Fagernes', 'Rjukan', 'Notodden', 'Bø', 'Kragerø',
  'Risør', 'Lyngdal', 'Farsund', 'Sirdal', 'Sauda'
] as const

const PREFIX = 'manifold/'

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/æ/g, 'ae')
    .replace(/ø/g, 'o')
    .replace(/å/g, 'a')
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

async function getExistingBranches(repoPath: string): Promise<Set<string>> {
  const git = simpleGit(repoPath)
  const branchSummary = await git.branch()
  return new Set(branchSummary.all)
}

export async function generateBranchName(repoPath: string): Promise<string> {
  const existing = await getExistingBranches(repoPath)

  for (const city of NORWEGIAN_CITIES) {
    const slug = slugify(city)
    const candidate = `${PREFIX}${slug}`
    if (!existing.has(candidate)) {
      return candidate
    }
  }

  // All base names taken; append numeric suffixes
  for (const city of NORWEGIAN_CITIES) {
    const slug = slugify(city)
    let suffix = 2
    while (suffix <= 999) {
      const candidate = `${PREFIX}${slug}-${suffix}`
      if (!existing.has(candidate)) {
        return candidate
      }
      suffix++
    }
  }

  // Extremely unlikely fallback
  const fallback = `${PREFIX}session-${Date.now()}`
  return fallback
}

export function slugifyCity(name: string): string {
  return slugify(name)
}
