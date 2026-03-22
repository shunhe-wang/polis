import { createHash } from "node:crypto";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { BallotImportMeta, BallotInput } from "@/lib/types";

function hashAddress(value: string): string {
  return createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}

function buildLookupKey(input: {
  addressHash: string;
  source: BallotImportMeta["source"];
  electionId: string | null;
  selectedParty: string | null;
}): string {
  return createHash("sha256")
    .update(input.addressHash)
    .update("\n")
    .update(input.source)
    .update("\n")
    .update(input.electionId ?? "")
    .update("\n")
    .update(input.selectedParty ?? "")
    .digest("hex");
}

export async function persistBallotImport(
  supabase: SupabaseClient,
  ballot: BallotInput,
  importMeta: BallotImportMeta,
  user: Pick<User, "id"> | null
): Promise<string | null> {
  const addressHash = hashAddress(ballot.address);
  const lookupKey = buildLookupKey({
    addressHash,
    source: importMeta.source,
    electionId: ballot.election?.id ?? null,
    selectedParty: ballot.election?.selectedParty ?? null,
  });

  const { data: importRow, error: importError } = await supabase
    .from("ballot_imports")
    .upsert(
      {
        user_id: user?.id ?? null,
        lookup_key: lookupKey,
        address_hash: addressHash,
        normalized_address: ballot.address,
        state_code: ballot.state || null,
        city_name: importMeta.locality?.city ?? null,
        county_name: importMeta.locality?.county ?? null,
        election_name: ballot.election?.name ?? null,
        election_day: ballot.election?.electionDay ?? null,
        election_kind: ballot.election?.kind ?? null,
        election_source_id: ballot.election?.id ?? null,
        selected_party: ballot.election?.selectedParty ?? null,
        source: importMeta.source,
        source_status: importMeta.status,
        source_confidence: importMeta.confidence,
        source_metadata: {
          message: importMeta.message,
          fallbackLinks: importMeta.fallbackLinks,
        },
        updated_at: new Date().toISOString(),
      },
      { onConflict: "lookup_key" }
    )
    .select("id")
    .single();

  if (importError || !importRow?.id) {
    return null;
  }

  const importId = importRow.id as string;

  const { data: existingContests } = await supabase
    .from("ballot_import_contests")
    .select("id")
    .eq("ballot_import_id", importId);

  if (Array.isArray(existingContests) && existingContests.length > 0) {
    const contestIds = existingContests.map((contest) => contest.id as string);
    await supabase
      .from("ballot_import_candidates")
      .delete()
      .in("contest_id", contestIds);
    await supabase
      .from("ballot_import_contests")
      .delete()
      .eq("ballot_import_id", importId);
  }

  for (const [index, race] of ballot.races.entries()) {
    const { data: contestRow } = await supabase
      .from("ballot_import_contests")
      .insert({
        ballot_import_id: importId,
        kind: "race",
        source_contest_id: race.id,
        title: race.name,
        office_name: race.name,
        contest_type: race.contestType ?? null,
        level: race.level,
        description: null,
        sort_order: index,
        raw_payload: race,
      })
      .select("id")
      .single();

    const contestId = contestRow?.id as string | undefined;
    if (!contestId) continue;

    if (race.candidates.length > 0) {
      await supabase.from("ballot_import_candidates").insert(
        race.candidates.map((candidate, candidateIndex) => ({
          contest_id: contestId,
          source_candidate_id: candidate.id,
          name: candidate.name,
          party: candidate.party,
          sort_order: candidateIndex,
          raw_payload: candidate,
        }))
      );
    }
  }

  for (const [index, measure] of ballot.measures.entries()) {
    await supabase.from("ballot_import_contests").insert({
      ballot_import_id: importId,
      kind: "measure",
      source_contest_id: measure.id,
      title: measure.title,
      office_name: null,
      contest_type: measure.type,
      level: ballot.state || null,
      description: measure.description,
      sort_order: ballot.races.length + index,
      raw_payload: measure,
    });
  }

  return importId;
}
