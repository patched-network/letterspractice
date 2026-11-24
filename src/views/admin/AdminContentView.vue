<template>
  <v-container fluid class="admin-content pa-4">
    <!-- Header -->
    <div class="d-flex align-center mb-4">
      <v-icon size="28" class="mr-2">mdi-database-search</v-icon>
      <h1 class="text-h4">Content Explorer</h1>
      <v-spacer />
      <v-btn
        variant="text"
        size="small"
        :loading="refreshing"
        @click="refreshAll"
        prepend-icon="mdi-refresh"
      >
        Refresh
      </v-btn>
    </div>

    <!-- Connection error -->
    <v-alert v-if="connectionError" type="error" variant="tonal" class="mb-4" closable>
      <v-alert-title>CouchDB Connection Error</v-alert-title>
      <p class="mt-1">{{ connectionError }}</p>
      <p class="text-body-2 mt-1">
        Make sure CouchDB is running and accessible. For local dev, in a
        vue-skuilder checkout: <code>yarn couchdb:start</code>
      </p>
    </v-alert>

    <!-- Summary Dashboard -->
    <v-row class="mb-4" v-if="summary">
      <v-col cols="12" sm="6" md="4" lg="2" v-for="stat in summaryCards" :key="stat.label">
        <v-card variant="tonal" :color="stat.color" class="text-center pa-3">
          <div class="text-h4 font-weight-bold">{{ stat.value }}</div>
          <div class="text-body-2 mt-1">{{ stat.label }}</div>
        </v-card>
      </v-col>
    </v-row>

    <!-- Loading state (initial) -->
    <div v-if="loading && !summary" class="text-center pa-8">
      <v-progress-circular indeterminate size="48" color="primary" />
      <div class="text-body-1 mt-4">Connecting to CouchDB...</div>
    </div>

    <!-- Main tabs -->
    <v-card v-if="summary">
      <v-tabs v-model="activeTab" color="primary" bg-color="surface">
        <v-tab value="lessons">
          <v-icon start>mdi-school</v-icon>
          Lessons
        </v-tab>
        <v-tab value="cards">
          <v-icon start>mdi-cards</v-icon>
          Cards ({{ summary.cardCount }})
        </v-tab>
        <v-tab value="tags">
          <v-icon start>mdi-tag-multiple</v-icon>
          Tags ({{ summary.tagCount }})
        </v-tab>
        <v-tab value="strategies">
          <v-icon start>mdi-compass</v-icon>
          Strategies ({{ summary.strategyCount }})
        </v-tab>
        <v-tab value="uploads">
          <v-icon start>mdi-upload-multiple</v-icon>
          Upload History ({{ summary.uploadMetaCount }})
        </v-tab>
        <v-tab value="config">
          <v-icon start>mdi-cog</v-icon>
          CourseConfig
        </v-tab>
      </v-tabs>

      <v-divider />

      <v-window v-model="activeTab">
        <!-- ==================== LESSONS TAB ==================== -->
        <v-window-item value="lessons">
          <v-card-text>
            <!-- Curriculum consistency checklist (P4.1, live) -->
            <v-card variant="outlined" class="mb-4">
              <v-card-title class="text-subtitle-1 d-flex align-center">
                <v-icon start>mdi-clipboard-check-outline</v-icon>
                Curriculum Consistency
                <v-spacer />
                <v-btn
                  icon="mdi-content-copy"
                  size="x-small"
                  variant="text"
                  density="compact"
                  class="mr-2"
                  title="Copy findings"
                  @click.stop="copyCurriculumFindings"
                />
                <v-chip
                  size="small"
                  variant="flat"
                  :color="curriculumErrorCount ? 'error' : curriculumWarnCount ? 'warning' : 'success'"
                >
                  {{ curriculumErrorCount }} error · {{ curriculumWarnCount }} warn
                </v-chip>
              </v-card-title>
              <v-card-text>
                <v-list density="compact" class="py-0">
                  <v-list-item
                    v-for="(f, i) in curriculumFindings"
                    :key="i"
                    class="px-0"
                  >
                    <template #prepend>
                      <v-icon :color="findingColor(f.severity)" class="mr-2">
                        {{ findingIcon(f.severity) }}
                      </v-icon>
                    </template>
                    <v-list-item-title class="text-body-2">
                      <code class="text-caption">{{ f.check }}</code> — {{ f.message }}
                    </v-list-item-title>
                    <div v-if="f.items?.length" class="text-caption text-disabled mt-1">
                      <div v-for="item in f.items.slice(0, 8)" :key="item">
                        <code>{{ item }}</code>
                      </div>
                      <div v-if="f.items.length > 8">
                        … and {{ f.items.length - 8 }} more
                      </div>
                    </div>
                  </v-list-item>
                </v-list>
                <div class="text-caption text-disabled mt-2">
                  Live against loaded TAG / strategy docs. WordSelection cards are
                  skipped in the traceability check (no word data client-side).
                  Non-zero traceability usually means the content deploy is behind
                  the curriculum — redeploy.
                </div>
              </v-card-text>
            </v-card>

            <!-- Active lessons -->
            <h3 class="text-h6 mb-3">
              <v-icon size="20" class="mr-1" color="success">mdi-check-circle</v-icon>
              Active MVP Lessons
            </h3>
            <div
              v-for="entry in lessonAudits.active"
              :key="entry.lesson.id"
              :id="`lesson-audit-${entry.lesson.id}`"
              class="mb-4"
            >
              <v-card variant="outlined">
                <v-card-title class="d-flex align-center">
                  <span>{{ entry.lesson.title }}</span>
                  <v-chip size="small" color="success" variant="flat" class="ml-2">Active</v-chip>
                  <v-spacer />
                  <v-btn
                    icon="mdi-content-copy"
                    size="x-small"
                    variant="text"
                    density="compact"
                    class="mr-2"
                    title="Copy lesson summary"
                    @click.stop="copyLessonText(entry)"
                  />
                  <code class="text-caption text-disabled">{{ entry.lesson.id }}</code>
                </v-card-title>
                <v-card-subtitle>{{ entry.lesson.description }}</v-card-subtitle>
                <v-card-text>
                  <!-- Concept tags -->
                  <div class="mb-2">
                    <span class="text-caption text-disabled mr-2">Gates:</span>
                    <v-chip
                      v-for="tag in entry.lesson.gatesConceptTags"
                      :key="tag"
                      size="small"
                      variant="outlined"
                      color="green"
                      class="mr-1"
                      @click="activeTab = 'cards'; cardFilters.tag = tag; loadCards()"
                    >
                      {{ tag }}
                    </v-chip>
                  </div>

                  <!-- Availability conditions -->
                  <div v-if="entry.lesson.availabilityConditions?.masteryPrereqs?.length" class="mb-2">
                    <span class="text-caption text-disabled mr-2">Availability prereqs:</span>
                    <v-chip
                      v-for="prereq in entry.lesson.availabilityConditions.masteryPrereqs"
                      :key="prereq.tag"
                      size="x-small"
                      variant="tonal"
                      class="mr-1"
                    >
                      {{ prereq.tag }}
                      <span v-if="prereq.minCount"> &ge;{{ prereq.minCount }}x</span>
                      <span v-if="prereq.minElo"> ELO&ge;{{ prereq.minElo }}</span>
                    </v-chip>
                  </div>

                  <!-- Prerequisites -->
                  <div v-if="entry.lesson.prerequisites?.length" class="mb-3">
                    <span class="text-caption text-disabled mr-2">After:</span>
                    <v-chip
                      v-for="prereq in entry.lesson.prerequisites"
                      :key="prereq"
                      size="x-small"
                      variant="tonal"
                      class="mr-1"
                    >
                      {{ prereq }}
                    </v-chip>
                  </div>

                  <!-- Card counts by type -->
                  <v-table v-if="entry.totalCards > 0" density="compact" class="mb-3">
                    <thead>
                      <tr>
                        <th>Card Type</th>
                        <th class="text-right">Count</th>
                        <th style="width: 40px;"></th>
                      </tr>
                    </thead>
                    <tbody>
                      <template v-for="(count, type) in entry.cardsByType" :key="String(type)">
                        <tr
                          style="cursor: pointer;"
                          @click="toggleCardType(entry.lesson.id, String(type))"
                        >
                          <td>
                            <v-chip
                              :color="questionTypeColor(String(type))"
                              size="small"
                              variant="flat"
                            >
                              {{ type }}
                            </v-chip>
                          </td>
                          <td class="text-right">{{ count }}</td>
                          <td>
                            <div class="d-flex align-center">
                              <v-btn
                                icon="mdi-content-copy"
                                size="x-small"
                                variant="text"
                                density="compact"
                                title="Copy card IDs"
                                @click.stop="copyQTypeText(entry, String(type))"
                              />
                              <v-icon size="16">
                                {{ isCardTypeExpanded(entry.lesson.id, String(type)) ? 'mdi-chevron-up' : 'mdi-chevron-down' }}
                              </v-icon>
                            </div>
                          </td>
                        </tr>
                        <tr v-if="isCardTypeExpanded(entry.lesson.id, String(type))">
                          <td colspan="3" class="pa-2" style="background: rgba(0,0,0,0.02);">
                            <div class="d-flex flex-wrap ga-1">
                              <v-chip
                                v-for="cardId in entry.cardIdsByType[String(type)]"
                                :key="cardId"
                                size="x-small"
                                variant="outlined"
                                :href="cardHref(cardId)"
                                @click.prevent="activeTab = 'cards'; cardSearch = cardId"
                              >
                                {{ cardId }}
                              </v-chip>
                            </div>
                          </td>
                        </tr>
                      </template>
                      <tr class="font-weight-bold">
                        <td>Total</td>
                        <td class="text-right">{{ entry.totalCards }}</td>
                        <td></td>
                      </tr>
                    </tbody>
                  </v-table>
                  <v-alert v-else type="warning" variant="tonal" density="compact" class="mb-3">
                    No cards found for this lesson's concept tags.
                  </v-alert>

                  <!-- Per-vowel sub-breakdown (split-digraphs lesson only) -->
                  <template v-if="entry.vowelBreakdown">
                    <div class="text-subtitle-2 mb-2 mt-2">Per-vowel breakdown</div>
                    <v-table density="compact" class="mb-3">
                      <thead>
                        <tr>
                          <th>Vowel</th>
                          <th
                            v-for="t in vowelTableTypes(entry.vowelBreakdown)"
                            :key="t"
                            class="text-right"
                          >
                            {{ t }}
                          </th>
                          <th class="text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        <template v-for="v in SPLIT_VOWELS" :key="v">
                          <tr>
                            <td><code>{{ v }}_e</code></td>
                            <td
                              v-for="t in vowelTableTypes(entry.vowelBreakdown)"
                              :key="t"
                              class="text-right"
                            >
                              <span
                                v-if="entry.vowelBreakdown[v].cardsByType[t]"
                                style="cursor: pointer; text-decoration: underline dotted;"
                                @click="toggleCardType(entry.lesson.id, `vowel:${v}:${t}`)"
                              >
                                {{ entry.vowelBreakdown[v].cardsByType[t] }}
                              </span>
                              <span v-else class="text-disabled">—</span>
                            </td>
                            <td class="text-right font-weight-medium">
                              {{ entry.vowelBreakdown[v].total }}
                            </td>
                          </tr>
                          <template
                            v-for="t in vowelTableTypes(entry.vowelBreakdown)"
                            :key="`${v}-${t}-exp`"
                          >
                            <tr v-if="isCardTypeExpanded(entry.lesson.id, `vowel:${v}:${t}`)">
                              <td
                                :colspan="vowelTableTypes(entry.vowelBreakdown).length + 2"
                                class="pa-2"
                                style="background: rgba(0,0,0,0.02);"
                              >
                                <div class="d-flex flex-wrap ga-1">
                                  <v-chip
                                    v-for="cardId in entry.vowelBreakdown[v].cardIdsByType[t] || []"
                                    :key="cardId"
                                    size="x-small"
                                    variant="outlined"
                                    @click="activeTab = 'cards'; cardSearch = cardId"
                                  >
                                    {{ cardId }}
                                  </v-chip>
                                </div>
                              </td>
                            </tr>
                          </template>
                        </template>
                      </tbody>
                    </v-table>
                    <v-alert
                      v-if="entry.vowelUnassigned && entry.vowelUnassigned.length"
                      type="warning"
                      variant="tonal"
                      density="compact"
                      class="mb-3"
                    >
                      {{ entry.vowelUnassigned.length }} card(s) couldn't be bucketed to a vowel:
                      {{ entry.vowelUnassigned.slice(0, 5).join(', ') }}{{ entry.vowelUnassigned.length > 5 ? '…' : '' }}
                    </v-alert>
                  </template>

                  <!-- Intro cards with prescribed decoration -->
                  <div v-if="entry.introCardIds.length > 0">
                    <div class="text-subtitle-2 mb-1">
                      Intro Cards ({{ entry.introCardIds.length }})
                    </div>
                    <div class="d-flex flex-wrap ga-1">
                      <v-chip
                        v-for="cardId in entry.introCardIds"
                        :key="cardId"
                        size="small"
                        :variant="entry.prescribedIntroIds.includes(cardId) ? 'flat' : 'outlined'"
                        :color="entry.prescribedIntroIds.includes(cardId) ? 'primary' : 'grey'"
                        :prepend-icon="entry.prescribedIntroIds.includes(cardId) ? 'mdi-star' : undefined"
                      >
                        {{ cardId }}
                      </v-chip>
                    </div>
                    <div class="text-caption text-disabled mt-1">
                      <v-icon size="12" color="primary">mdi-star</v-icon> = in prescribed strategy
                      <span v-if="entry.unprescribedIntroIds.length > 0" class="ml-2 text-warning">
                        ({{ entry.unprescribedIntroIds.length }} intro(s) not prescribed)
                      </span>
                    </div>
                  </div>
                </v-card-text>
              </v-card>
            </div>

            <!-- Deferred lessons -->
            <h3 class="text-h6 mb-3 mt-6">
              <v-icon size="20" class="mr-1" color="grey">mdi-clock-outline</v-icon>
              Deferred Lessons
            </h3>
            <div
              v-for="entry in lessonAudits.deferred"
              :key="entry.lesson.id"
              :id="`lesson-audit-${entry.lesson.id}`"
              class="mb-4"
            >
              <v-card variant="outlined" style="opacity: 0.7;">
                <v-card-title class="d-flex align-center">
                  <span>{{ entry.lesson.title }}</span>
                  <v-chip size="small" color="grey" variant="flat" class="ml-2">Deferred</v-chip>
                  <v-spacer />
                  <v-btn
                    icon="mdi-content-copy"
                    size="x-small"
                    variant="text"
                    density="compact"
                    class="mr-2"
                    title="Copy lesson summary"
                    @click.stop="copyLessonText(entry)"
                  />
                  <code class="text-caption text-disabled">{{ entry.lesson.id }}</code>
                </v-card-title>
                <v-card-subtitle>{{ entry.lesson.description }}</v-card-subtitle>
                <v-card-text>
                  <div class="mb-2">
                    <span class="text-caption text-disabled mr-2">Gates:</span>
                    <v-chip
                      v-for="tag in entry.lesson.gatesConceptTags"
                      :key="tag"
                      size="small"
                      variant="outlined"
                      color="grey"
                      class="mr-1"
                      @click="activeTab = 'cards'; cardFilters.tag = tag; loadCards()"
                    >
                      {{ tag }}
                    </v-chip>
                  </div>

                  <!-- Catalogue-driven: every GPC this lesson releases, incl. zero-card -->
                  <div class="text-subtitle-2 mb-1 d-flex align-center">
                    GPCs released ({{ gpcRowsForLesson(entry.lesson.id).length }})
                    <v-btn
                      icon="mdi-content-copy"
                      size="x-small"
                      variant="text"
                      density="compact"
                      class="ml-1"
                      title="Copy GPC roster"
                      @click.stop="copyLessonGpcs(entry.lesson.id)"
                    />
                  </div>
                  <v-table
                    v-if="gpcRowsForLesson(entry.lesson.id).length"
                    density="compact"
                    class="mb-4"
                  >
                    <thead>
                      <tr>
                        <th>GPC</th>
                        <th>g→p</th>
                        <th>category</th>
                        <th>examples</th>
                        <th class="text-right">cards</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="p in gpcRowsForLesson(entry.lesson.id)" :key="p.gpcId">
                        <td><code class="text-caption">{{ p.gpcId }}</code></td>
                        <td>{{ p.grapheme }}→{{ p.phoneme }}</td>
                        <td class="text-caption text-disabled">{{ p.category }}</td>
                        <td class="text-caption">{{ p.examples.join(', ') || '—' }}</td>
                        <td class="text-right">
                          <span :class="p.cardCount === 0 ? 'text-disabled' : ''">{{ p.cardCount }}</span>
                        </td>
                      </tr>
                    </tbody>
                  </v-table>

                  <div class="text-subtitle-2 mb-1" v-if="entry.totalCards > 0">By card type</div>
                  <v-table v-if="entry.totalCards > 0" density="compact">
                    <thead>
                      <tr>
                        <th>Card Type</th>
                        <th class="text-right">Count</th>
                        <th style="width: 40px;"></th>
                      </tr>
                    </thead>
                    <tbody>
                      <template v-for="(count, type) in entry.cardsByType" :key="String(type)">
                        <tr
                          style="cursor: pointer;"
                          @click="toggleCardType(entry.lesson.id, String(type))"
                        >
                          <td>
                            <v-chip :color="questionTypeColor(String(type))" size="small" variant="flat">
                              {{ type }}
                            </v-chip>
                          </td>
                          <td class="text-right">{{ count }}</td>
                          <td>
                            <div class="d-flex align-center">
                              <v-btn
                                icon="mdi-content-copy"
                                size="x-small"
                                variant="text"
                                density="compact"
                                title="Copy card IDs"
                                @click.stop="copyQTypeText(entry, String(type))"
                              />
                              <v-icon size="16">
                                {{ isCardTypeExpanded(entry.lesson.id, String(type)) ? 'mdi-chevron-up' : 'mdi-chevron-down' }}
                              </v-icon>
                            </div>
                          </td>
                        </tr>
                        <tr v-if="isCardTypeExpanded(entry.lesson.id, String(type))">
                          <td colspan="3" class="pa-2" style="background: rgba(0,0,0,0.02);">
                            <div class="d-flex flex-wrap ga-1">
                              <v-chip
                                v-for="cardId in entry.cardIdsByType[String(type)]"
                                :key="cardId"
                                size="x-small"
                                variant="outlined"
                                :href="cardHref(cardId)"
                                @click.prevent="activeTab = 'cards'; cardSearch = cardId"
                              >
                                {{ cardId }}
                              </v-chip>
                            </div>
                          </td>
                        </tr>
                      </template>
                      <tr class="font-weight-bold">
                        <td>Total</td>
                        <td class="text-right">{{ entry.totalCards }}</td>
                        <td></td>
                      </tr>
                    </tbody>
                  </v-table>
                  <v-alert v-else type="info" variant="tonal" density="compact">
                    No cards found — expected for deferred content.
                  </v-alert>
                </v-card-text>
              </v-card>
            </div>

            <!-- Unassigned / parked pool -->
            <h3 class="text-h6 mb-3 mt-6">
              <v-icon size="20" class="mr-1" color="warning">mdi-help-circle-outline</v-icon>
              Unassigned / Parked
            </h3>
            <div class="mb-4">
              <v-card variant="outlined" style="opacity: 0.85;">
                <v-card-title class="d-flex align-center">
                  <span>{{ unassignedAudit.lesson.title }}</span>
                  <v-chip size="small" color="warning" variant="flat" class="ml-2">
                    unassigned
                  </v-chip>
                  <v-spacer />
                  <v-btn
                    icon="mdi-content-copy"
                    size="x-small"
                    variant="text"
                    density="compact"
                    class="mr-2"
                    title="Copy parked GPC list"
                    @click.stop="copyParkedGpcs"
                  />
                  <code class="text-caption text-disabled">concept:unassigned</code>
                </v-card-title>
                <v-card-subtitle>{{ unassignedAudit.lesson.description }}</v-card-subtitle>
                <v-card-text>
                  <!-- Catalogue-driven: every parked GPC, incl. zero-card ones (D7) -->
                  <div class="text-subtitle-2 mb-1">
                    Parked GPCs ({{ parkedGpcs.length }})
                  </div>
                  <v-table density="compact" class="mb-4">
                    <thead>
                      <tr>
                        <th>GPC</th>
                        <th>g→p</th>
                        <th>category</th>
                        <th>examples</th>
                        <th class="text-right">cards</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="p in parkedGpcs" :key="p.gpcId">
                        <td><code class="text-caption">{{ p.gpcId }}</code></td>
                        <td>{{ p.grapheme }}→{{ p.phoneme }}</td>
                        <td class="text-caption text-disabled">{{ p.category }}</td>
                        <td class="text-caption">{{ p.examples.join(', ') || '—' }}</td>
                        <td class="text-right">
                          <span :class="p.cardCount === 0 ? 'text-disabled' : ''">{{ p.cardCount }}</span>
                        </td>
                      </tr>
                    </tbody>
                  </v-table>

                  <div class="text-subtitle-2 mb-1">By card type</div>
                  <v-table v-if="unassignedAudit.totalCards > 0" density="compact" class="mb-3">
                    <thead>
                      <tr>
                        <th>Card Type</th>
                        <th class="text-right">Count</th>
                        <th style="width: 40px;"></th>
                      </tr>
                    </thead>
                    <tbody>
                      <template v-for="(count, type) in unassignedAudit.cardsByType" :key="String(type)">
                        <tr style="cursor: pointer;" @click="toggleCardType('unassigned', String(type))">
                          <td>
                            <v-chip :color="questionTypeColor(String(type))" size="small" variant="flat">
                              {{ type }}
                            </v-chip>
                          </td>
                          <td class="text-right">{{ count }}</td>
                          <td>
                            <v-icon size="16">
                              {{ isCardTypeExpanded('unassigned', String(type)) ? 'mdi-chevron-up' : 'mdi-chevron-down' }}
                            </v-icon>
                          </td>
                        </tr>
                        <tr v-if="isCardTypeExpanded('unassigned', String(type))">
                          <td colspan="3" class="pa-2" style="background: rgba(0,0,0,0.02);">
                            <div class="d-flex flex-wrap ga-1">
                              <v-chip
                                v-for="cardId in unassignedAudit.cardIdsByType[String(type)]"
                                :key="cardId"
                                size="x-small"
                                variant="outlined"
                                @click.prevent="activeTab = 'cards'; cardSearch = cardId"
                              >
                                {{ cardId }}
                              </v-chip>
                            </div>
                          </td>
                        </tr>
                      </template>
                      <tr class="font-weight-bold">
                        <td>Total</td>
                        <td class="text-right">{{ unassignedAudit.totalCards }}</td>
                        <td></td>
                      </tr>
                    </tbody>
                  </v-table>
                  <v-alert v-else type="info" variant="tonal" density="compact">
                    No cards currently carry <code>concept:unassigned</code>.
                  </v-alert>
                </v-card-text>
              </v-card>
            </div>
          </v-card-text>
        </v-window-item>

        <!-- ==================== CARDS TAB ==================== -->
        <v-window-item value="cards">
          <v-card-text>
            <!-- Orphan (stale) cards — present in DB but referenced by no TAG -->
            <v-alert
              v-if="orphanCards.length > 0"
              type="warning"
              variant="tonal"
              class="mb-4"
              icon="mdi-delete-sweep"
            >
              <div class="d-flex align-center flex-wrap ga-2">
                <div>
                  <v-alert-title class="text-body-1">
                    {{ orphanCards.length }} orphaned card{{ orphanCards.length === 1 ? '' : 's' }}
                    (no tag references)
                  </v-alert-title>
                  <div class="text-body-2 mt-1">
                    Present in the DB but referenced by no TAG document — unreachable
                    by every navigation strategy. Leftover from a content scrub that
                    was never pruned (TAG docs deploy in REPLACE mode; the c-/dd- docs
                    linger). Safe to delete.
                  </div>
                </div>
                <v-spacer />
                <v-btn
                  color="error"
                  variant="flat"
                  size="small"
                  prepend-icon="mdi-delete"
                  :loading="orphanDeleting"
                  @click="confirmOrphanDialog = true"
                >
                  Delete {{ orphanCards.length }} orphan{{ orphanCards.length === 1 ? '' : 's' }}
                </v-btn>
              </div>
              <div class="d-flex flex-wrap ga-1 mt-3">
                <v-chip
                  v-for="o in orphanCards"
                  :key="o.cardId"
                  size="x-small"
                  variant="outlined"
                  color="warning"
                >
                  {{ o.cardId }}
                </v-chip>
              </div>
            </v-alert>

            <v-alert
              v-if="orphanResult"
              type="info"
              variant="tonal"
              class="mb-4"
              closable
              @click:close="orphanResult = null"
            >
              {{ orphanResult }}
            </v-alert>

            <!-- Filters -->
            <v-row dense class="mb-3">
              <v-col cols="12" sm="4" md="3">
                <v-select
                  v-model="cardFilters.questionType"
                  :items="questionTypeItems"
                  label="Exercise Type"
                  clearable
                  density="compact"
                  variant="outlined"
                  hide-details
                  @update:model-value="loadCards"
                />
              </v-col>
              <v-col cols="12" sm="4" md="3">
                <v-autocomplete
                  v-model="cardFilters.tag"
                  :items="summary.tagNames"
                  label="Tag"
                  clearable
                  density="compact"
                  variant="outlined"
                  hide-details
                  @update:model-value="loadCards"
                />
              </v-col>
              <v-col cols="12" sm="4" md="3">
                <v-text-field
                  v-model="cardSearch"
                  label="Search (ID or data)"
                  clearable
                  density="compact"
                  variant="outlined"
                  hide-details
                  prepend-inner-icon="mdi-magnify"
                />
              </v-col>
              <v-col cols="12" md="3" class="d-flex align-center">
                <v-chip-group>
                  <v-chip
                    v-for="(count, qType) in summary.cardsByType"
                    :key="qType"
                    :color="questionTypeColor(qType)"
                    variant="outlined"
                    size="small"
                    @click="cardFilters.questionType = qType; loadCards()"
                  >
                    {{ qType }} ({{ count }})
                  </v-chip>
                </v-chip-group>
              </v-col>
            </v-row>

            <!-- Cards loading -->
            <div v-if="cardsLoading" class="text-center pa-6">
              <v-progress-circular indeterminate size="32" color="primary" />
              <span class="ml-3">Loading cards...</span>
            </div>

            <!-- Cards table -->
            <v-data-table
              v-else-if="filteredCards.length > 0"
              :headers="cardHeaders"
              :items="filteredCards"
              :items-per-page="25"
              :search="cardSearch"
              density="compact"
              class="elevation-0"
              hover
              :custom-filter="cardSearchFilter"
            >
              <template #item._id="{ item }">
                <code class="text-body-2">{{ item.card._id }}</code>
              </template>

              <template #item.questionType="{ item }">
                <v-chip
                  :color="questionTypeColor(item.questionType)"
                  size="small"
                  variant="flat"
                >
                  {{ item.questionType }}
                </v-chip>
              </template>

              <template #item.data="{ item }">
                <span class="text-body-2">
                  {{ formatDataFields(item.dataFields) }}
                </span>
              </template>

              <template #item.tags="{ item }">
                <div class="d-flex flex-wrap ga-1" style="max-width: 400px;">
                  <v-chip
                    v-for="tag in item.tags.slice(0, 5)"
                    :key="tag"
                    size="x-small"
                    variant="outlined"
                    :color="tagColor(tag)"
                    @click="cardFilters.tag = tag; loadCards()"
                  >
                    {{ tag }}
                  </v-chip>
                  <v-chip
                    v-if="item.tags.length > 5"
                    size="x-small"
                    variant="text"
                  >
                    +{{ item.tags.length - 5 }}
                  </v-chip>
                </div>
              </template>

              <template #item.elo="{ item }">
                <span class="text-body-2">
                  {{ item.eloScore }} <span class="text-disabled">({{ item.eloCount }}×)</span>
                </span>
              </template>

              <template #item.actions="{ item }">
                <v-btn
                  icon="mdi-eye"
                  size="x-small"
                  variant="text"
                  @click="inspectCard(item)"
                />
              </template>
            </v-data-table>

            <!-- No results -->
            <v-alert v-else-if="!cardsLoading" type="info" variant="tonal">
              No cards match the current filters.
            </v-alert>
          </v-card-text>
        </v-window-item>

        <!-- ==================== TAGS TAB ==================== -->
        <v-window-item value="tags">
          <v-card-text>
            <v-row dense class="mb-3">
              <v-col cols="12" sm="4">
                <v-select
                  v-model="tagCategoryFilter"
                  :items="tagCategoryItems"
                  label="Category"
                  clearable
                  density="compact"
                  variant="outlined"
                  hide-details
                />
              </v-col>
              <v-col cols="12" sm="4">
                <v-text-field
                  v-model="tagSearch"
                  label="Search tags"
                  clearable
                  density="compact"
                  variant="outlined"
                  hide-details
                  prepend-inner-icon="mdi-magnify"
                />
              </v-col>
            </v-row>

            <div v-if="tagsLoading" class="text-center pa-6">
              <v-progress-circular indeterminate size="32" color="primary" />
              <span class="ml-3">Loading tags...</span>
            </div>

            <template v-else>
              <!-- Grouped tag cards -->
              <div v-for="(tags, category) in filteredGroupedTags" :key="category" class="mb-4">
                <h3 class="text-h6 mb-2">
                  <v-icon size="18" class="mr-1">{{ categoryIcon(category) }}</v-icon>
                  {{ category }}
                  <v-chip size="x-small" class="ml-2">{{ tags.length }}</v-chip>
                </h3>
                <v-row dense>
                  <v-col
                    v-for="tag in tags"
                    :key="tag._id"
                    cols="12"
                    sm="6"
                    md="4"
                    lg="3"
                  >
                    <v-card
                      variant="outlined"
                      density="compact"
                      class="pa-2"
                      :color="tagColor(tag.name)"
                    >
                      <div class="d-flex justify-space-between align-center">
                        <div>
                          <div class="text-body-2 font-weight-medium">{{ tag.name }}</div>
                          <div class="text-caption text-disabled">
                            {{ tag.taggedCards?.length || 0 }} cards
                          </div>
                        </div>
                        <v-btn
                          icon="mdi-filter"
                          size="x-small"
                          variant="text"
                          @click="activeTab = 'cards'; cardFilters.tag = tag.name; loadCards()"
                          title="Show cards with this tag"
                        />
                      </div>
                    </v-card>
                  </v-col>
                </v-row>
              </div>

              <v-alert v-if="Object.keys(filteredGroupedTags).length === 0" type="info" variant="tonal">
                No tags match the current filters.
              </v-alert>
            </template>
          </v-card-text>
        </v-window-item>

        <!-- ==================== STRATEGIES TAB ==================== -->
        <v-window-item value="strategies">
          <v-card-text>
            <div class="d-flex align-center justify-end mb-3">
              <span class="text-caption text-medium-emphasis mr-2">view</span>
              <v-btn-toggle
                :model-value="strategiesView"
                density="compact"
                variant="outlined"
                color="primary"
                mandatory
                @update:model-value="setStrategiesView"
              >
                <v-btn value="lp" size="x-small">LettersPractice</v-btn>
                <v-btn value="fw" size="x-small">Framework</v-btn>
              </v-btn-toggle>
            </div>
            <div v-if="strategiesLoading" class="text-center pa-6">
              <v-progress-circular indeterminate size="32" color="primary" />
              <span class="ml-3">Loading strategies...</span>
            </div>

            <pipeline-overview
              v-else-if="strategiesView === 'fw'"
              :strategies="strategyDocs"
              :course-id="COURSE_ID"
            />
            <v-row v-else dense>
              <v-col
                v-for="strat in strategies"
                :key="strat._id"
                cols="12"
                md="6"
              >
                <v-card variant="outlined" class="pa-3">
                  <div class="d-flex align-center mb-2">
                    <v-icon color="primary" class="mr-2">mdi-compass</v-icon>
                    <div>
                      <div class="text-subtitle-1 font-weight-bold">{{ strat.name }}</div>
                      <code class="text-caption">{{ strat._id }}</code>
                    </div>
                  </div>
                  <p class="text-body-2 mb-2">{{ strat.description }}</p>
                  <v-chip size="small" variant="outlined" class="mr-2">
                    <v-icon start size="14">mdi-code-braces</v-icon>
                    {{ strat.implementingClass }}
                  </v-chip>
                  <v-chip size="small" variant="outlined" v-if="strat.sourceRef">
                    <v-icon start size="14">mdi-source-branch</v-icon>
                    {{ strat.sourceRef }}
                  </v-chip>
                  <div class="mt-2">
                    <v-btn
                      size="small"
                      variant="text"
                      @click="toggleStrategyData(strat._id)"
                    >
                      {{ expandedStrategies.has(strat._id) ? 'Hide' : 'Show' }} serialized data
                    </v-btn>
                    <pre
                      v-if="expandedStrategies.has(strat._id)"
                      class="text-caption mt-2 pa-2 bg-grey-lighten-4 rounded overflow-auto"
                      style="max-height: 300px;"
                    >{{ formatStrategyData(strat.serializedData) }}</pre>
                  </div>
                </v-card>
              </v-col>
            </v-row>

            <v-alert
              v-if="strategiesView === 'lp' && !strategiesLoading && strategies.length === 0"
              type="info"
              variant="tonal"
            >
              No navigation strategies found in the database.
            </v-alert>
          </v-card-text>
        </v-window-item>

        <!-- ==================== UPLOADS TAB ==================== -->
        <v-window-item value="uploads">
          <v-card-text>
            <div v-if="uploadsLoading" class="text-center pa-6">
              <v-progress-circular indeterminate size="32" color="primary" />
              <span class="ml-3">Loading upload history...</span>
            </div>

            <template v-else>
              <v-alert v-if="uploadMetadocs.length === 0" type="info" variant="tonal">
                No upload metadocs found. These are created by
                <code>yarn deploy:content</code> runs.
              </v-alert>

              <v-timeline v-else side="end" density="compact">
                <v-timeline-item
                  v-for="meta in uploadMetadocs"
                  :key="meta._id"
                  :dot-color="meta.uploadStats?.errors?.length ? 'warning' : 'success'"
                  size="small"
                >
                  <v-card variant="outlined" class="pa-3">
                    <div class="d-flex align-center mb-1">
                      <v-icon
                        :color="meta.uploadStats?.errors?.length ? 'warning' : 'success'"
                        size="18"
                        class="mr-2"
                      >
                        {{ meta.uploadStats?.errors?.length ? 'mdi-alert' : 'mdi-check-circle' }}
                      </v-icon>
                      <span class="text-subtitle-2 font-weight-bold">
                        {{ formatDate(meta.uploadedAt) }}
                      </span>
                      <v-spacer />
                      <code class="text-caption text-disabled">{{ meta._id }}</code>
                    </div>

                    <v-row dense class="mt-1">
                      <v-col cols="6" sm="3">
                        <div class="text-caption text-disabled">Cards</div>
                        <div class="text-body-2">
                          {{ meta.uploadStats?.cardsCreated || 0 }} new,
                          {{ meta.uploadStats?.cardsUpdated || 0 }} updated
                        </div>
                      </v-col>
                      <v-col cols="6" sm="3">
                        <div class="text-caption text-disabled">Data Docs</div>
                        <div class="text-body-2">
                          {{ meta.uploadStats?.dataDocsCreated || 0 }} new,
                          {{ meta.uploadStats?.dataDocsUpdated || 0 }} updated
                        </div>
                      </v-col>
                      <v-col cols="6" sm="3">
                        <div class="text-caption text-disabled">Tags</div>
                        <div class="text-body-2">
                          {{ meta.uploadStats?.tagsCreated || 0 }} new,
                          {{ meta.uploadStats?.tagsUpdated || 0 }} updated
                        </div>
                      </v-col>
                      <v-col cols="6" sm="3">
                        <div class="text-caption text-disabled">Strategies</div>
                        <div class="text-body-2">
                          {{ meta.uploadStats?.strategiesCreated || 0 }} new,
                          {{ meta.uploadStats?.strategiesUpdated || 0 }} updated
                        </div>
                      </v-col>
                    </v-row>

                    <v-row dense class="mt-1" v-if="meta.inputFile">
                      <v-col cols="6" sm="3">
                        <div class="text-caption text-disabled">Input Cards</div>
                        <div class="text-body-2">{{ meta.inputFile.totalCards }}</div>
                      </v-col>
                      <v-col cols="6" sm="3">
                        <div class="text-caption text-disabled">Generated</div>
                        <div class="text-body-2">{{ formatDate(meta.inputFile.generatedAt) }}</div>
                      </v-col>
                      <v-col cols="6" sm="3">
                        <div class="text-caption text-disabled">Duration</div>
                        <div class="text-body-2">{{ meta.durationMs ? (meta.durationMs / 1000).toFixed(1) + 's' : '—' }}</div>
                      </v-col>
                      <v-col cols="6" sm="3">
                        <div class="text-caption text-disabled">Target</div>
                        <div class="text-body-2 text-truncate" style="max-width: 200px;">
                          {{ meta.targetUrl || '—' }}
                        </div>
                      </v-col>
                    </v-row>

                    <div v-if="meta.inputFile?.stats" class="mt-2">
                      <v-chip
                        v-for="(count, key) in meta.inputFile.stats"
                        :key="key"
                        size="x-small"
                        variant="outlined"
                        class="mr-1 mb-1"
                      >
                        {{ key }}: {{ count }}
                      </v-chip>
                    </div>

                    <v-alert
                      v-if="meta.uploadStats?.errors?.length"
                      type="warning"
                      variant="tonal"
                      density="compact"
                      class="mt-2"
                    >
                      {{ meta.uploadStats.errors.length }} error(s):
                      <ul class="text-caption mt-1">
                        <li v-for="(err, idx) in meta.uploadStats.errors.slice(0, 5)" :key="idx">
                          {{ err }}
                        </li>
                        <li v-if="meta.uploadStats.errors.length > 5">
                          ... and {{ meta.uploadStats.errors.length - 5 }} more
                        </li>
                      </ul>
                    </v-alert>
                  </v-card>
                </v-timeline-item>
              </v-timeline>
            </template>
          </v-card-text>
        </v-window-item>

        <!-- ==================== CONFIG TAB ==================== -->
        <v-window-item value="config">
          <v-card-text>
            <div v-if="configLoading" class="text-center pa-6">
              <v-progress-circular indeterminate size="32" color="primary" />
              <span class="ml-3">Loading CourseConfig...</span>
            </div>

            <template v-else-if="courseConfig">
              <h3 class="text-h6 mb-3">CourseConfig</h3>

              <v-row dense>
                <v-col cols="12" md="6">
                  <v-card variant="outlined" class="pa-3 mb-3">
                    <div class="text-subtitle-2 font-weight-bold mb-2">Data Shapes</div>
                    <v-list density="compact" v-if="courseConfigDataShapes.length">
                      <v-list-item
                        v-for="ds in courseConfigDataShapes"
                        :key="ds.name"
                      >
                        <v-list-item-title>
                          <code>{{ ds.name }}</code>
                        </v-list-item-title>
                        <v-list-item-subtitle v-if="ds.questionTypes?.length">
                          Question types: {{ ds.questionTypes.join(', ') }}
                        </v-list-item-subtitle>
                      </v-list-item>
                    </v-list>
                    <div v-else class="text-body-2 text-disabled">No data shapes registered</div>
                  </v-card>
                </v-col>

                <v-col cols="12" md="6">
                  <v-card variant="outlined" class="pa-3 mb-3">
                    <div class="text-subtitle-2 font-weight-bold mb-2">Question Types</div>
                    <v-list density="compact" v-if="courseConfigQuestionTypes.length">
                      <v-list-item
                        v-for="qt in courseConfigQuestionTypes"
                        :key="qt.name"
                      >
                        <v-list-item-title>
                          <code>{{ qt.name }}</code>
                        </v-list-item-title>
                        <v-list-item-subtitle>
                          Views: {{ qt.viewList?.join(', ') || '—' }}
                        </v-list-item-subtitle>
                      </v-list-item>
                    </v-list>
                    <div v-else class="text-body-2 text-disabled">No question types registered</div>
                  </v-card>
                </v-col>
              </v-row>

              <v-btn
                size="small"
                variant="text"
                @click="showRawConfig = !showRawConfig"
              >
                {{ showRawConfig ? 'Hide' : 'Show' }} raw JSON
              </v-btn>
              <pre
                v-if="showRawConfig"
                class="text-caption mt-2 pa-3 bg-grey-lighten-4 rounded overflow-auto"
                style="max-height: 400px;"
              >{{ JSON.stringify(courseConfig, null, 2) }}</pre>
            </template>

            <v-alert v-else type="warning" variant="tonal">
              CourseConfig document not found in the database.
            </v-alert>
          </v-card-text>
        </v-window-item>
      </v-window>
    </v-card>

    <!-- Orphan Delete Confirmation -->
    <v-dialog v-model="confirmOrphanDialog" max-width="560">
      <v-card>
        <v-card-title class="d-flex align-center">
          <v-icon color="error" class="mr-2">mdi-delete-alert</v-icon>
          Delete orphaned cards?
        </v-card-title>
        <v-divider />
        <v-card-text>
          <p class="mb-2">
            This permanently deletes <strong>{{ orphanCards.length }}</strong>
            card document{{ orphanCards.length === 1 ? '' : 's' }} and
            {{ orphanCards.length === 1 ? 'its' : 'their' }} displayable-data
            doc{{ orphanCards.length === 1 ? '' : 's' }}
            ({{ orphanCards.length * 2 }} docs) from the
            <strong>live</strong> course database. This cannot be undone.
          </p>
          <p class="text-body-2 text-medium-emphasis mb-0">
            These cards carry no tag references, so no navigation strategy reaches
            them — deleting them has no effect on any learner's content.
          </p>
        </v-card-text>
        <v-divider />
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" :disabled="orphanDeleting" @click="confirmOrphanDialog = false">
            Cancel
          </v-btn>
          <v-btn color="error" variant="flat" :loading="orphanDeleting" @click="deleteOrphans">
            Delete {{ orphanCards.length * 2 }} docs
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Card Detail Dialog -->
    <v-dialog v-model="inspectDialog" max-width="700">
      <v-card v-if="inspectedCard">
        <v-card-title class="d-flex align-center">
          <v-icon class="mr-2">mdi-card-text</v-icon>
          Card Detail
          <v-spacer />
          <v-btn icon="mdi-close" variant="text" size="small" @click="inspectDialog = false" />
        </v-card-title>
        <v-divider />
        <v-card-text>
          <v-row dense>
            <v-col cols="12" sm="6">
              <div class="text-caption text-disabled">Card ID</div>
              <code>{{ inspectedCard.card._id }}</code>
            </v-col>
            <v-col cols="12" sm="6">
              <div class="text-caption text-disabled">Question Type</div>
              <v-chip :color="questionTypeColor(inspectedCard.questionType)" size="small">
                {{ inspectedCard.questionType }}
              </v-chip>
            </v-col>
          </v-row>

          <v-divider class="my-3" />

          <div class="text-subtitle-2 mb-2">Data Fields</div>
          <v-table density="compact" class="mb-3">
            <tbody>
              <tr v-for="(value, key) in inspectedCard.dataFields" :key="String(key)">
                <td class="font-weight-medium" style="width: 120px;">{{ key }}</td>
                <td><code class="text-body-2">{{ JSON.stringify(value) }}</code></td>
              </tr>
            </tbody>
          </v-table>

          <div class="text-subtitle-2 mb-2">Tags</div>
          <div class="d-flex flex-wrap ga-1 mb-3">
            <v-chip
              v-for="tag in inspectedCard.tags"
              :key="tag"
              size="small"
              variant="outlined"
              :color="tagColor(tag)"
            >
              {{ tag }}
            </v-chip>
          </div>

          <v-row dense>
            <v-col cols="6">
              <div class="text-caption text-disabled">ELO Score</div>
              <div>{{ inspectedCard.eloScore }}</div>
            </v-col>
            <v-col cols="6">
              <div class="text-caption text-disabled">Times Seen</div>
              <div>{{ inspectedCard.eloCount }}</div>
            </v-col>
            <v-col cols="6">
              <div class="text-caption text-disabled">View</div>
              <code class="text-caption">{{ inspectedCard.viewName }}</code>
            </v-col>
            <v-col cols="6">
              <div class="text-caption text-disabled">Data Shape</div>
              <code class="text-caption">{{ inspectedCard.dataShape }}</code>
            </v-col>
          </v-row>

          <v-divider class="my-3" />

          <v-btn size="small" variant="text" @click="showRawCard = !showRawCard">
            {{ showRawCard ? 'Hide' : 'Show' }} raw JSON
          </v-btn>
          <pre
            v-if="showRawCard"
            class="text-caption mt-2 pa-2 bg-grey-lighten-4 rounded overflow-auto"
            style="max-height: 300px;"
          >{{ JSON.stringify({ card: inspectedCard.card, dataDoc: inspectedCard.dataDoc }, null, 2) }}</pre>
        </v-card-text>
      </v-card>
    </v-dialog>
  </v-container>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, reactive, nextTick } from 'vue';
import { useRoute } from 'vue-router';
import type { ContentNavigationStrategyData } from '@vue-skuilder/db';
import { PipelineOverview } from '@vue-skuilder/common-ui/admin';
import '@vue-skuilder/common-ui/admin/style';
import {
  COURSE_ID,
  getContentSummary,
  getEnrichedCards,
  getTags,
  getStrategies,
  getUploadMetadocs,
  getCourseConfig,
  getOrphanCards,
  deleteDocsById,
  groupTagsByCategory,
  categorizeTag,
  type ContentSummary,
  type EnrichedCard,
  type TagDoc,
  type StrategyDoc,
  type UploadMetadoc,
  type CouchDoc,
  type OrphanCard,
} from '@/services/adminContentService';
import {
  LESSON_CATALOG,
  DEFERRED_LESSON_CATALOG,
} from '@/services/lessons';
import type { LessonDefinition } from '@/services/lessons.types';
import {
  CONCEPT_UNASSIGNED,
  UNASSIGNED,
  GPC_CATALOGUE,
  assignmentFor,
  buildExpectedTopology,
  invertTagDocs,
  runCurriculumChecks,
  type Finding,
  type Severity,
} from '@/services/curriculum';

// ============================================================
// State
// ============================================================

const loading = ref(true);
const refreshing = ref(false);
const connectionError = ref<string | null>(null);
const activeTab = ref('lessons');

// Summary
const summary = ref<ContentSummary | null>(null);

// Cards
const cardsLoading = ref(false);
const enrichedCards = ref<EnrichedCard[]>([]);
const cardFilters = reactive({
  questionType: null as string | null,
  tag: null as string | null,
});
const cardSearch = ref('');

// Orphan (stale) cards — present in the DB but referenced by no TAG doc.
const orphanCards = ref<OrphanCard[]>([]);
const orphansLoading = ref(false);
const orphanDeleting = ref(false);
const confirmOrphanDialog = ref(false);
const orphanResult = ref<string | null>(null);

// Tags
const tagsLoading = ref(false);
const allTags = ref<TagDoc[]>([]);
const tagCategoryFilter = ref<string | null>(null);
const tagSearch = ref('');

// Strategies
const strategiesLoading = ref(false);
const strategies = ref<StrategyDoc[]>([]);
// The same docs, typed for the framework's pipeline view.
const strategyDocs = computed(() => strategies.value as unknown as ContentNavigationStrategyData[]);

// Strategies tab: LP's doc list or the framework's pipeline view, remembered like AdminViewSwitch.
const STRATEGIES_VIEW_KEY = 'lp.admin.strategiesView';
function readStrategiesView(): 'lp' | 'fw' {
  try {
    return localStorage.getItem(STRATEGIES_VIEW_KEY) === 'fw' ? 'fw' : 'lp';
  } catch {
    return 'lp';
  }
}
const strategiesView = ref<'lp' | 'fw'>(readStrategiesView());
function setStrategiesView(value: 'lp' | 'fw'): void {
  strategiesView.value = value;
  try {
    localStorage.setItem(STRATEGIES_VIEW_KEY, value);
  } catch {
    // Private windows can refuse storage; the toggle still works for this page.
  }
}
const expandedStrategies = ref(new Set<string>());

// Uploads
const uploadsLoading = ref(false);
const uploadMetadocs = ref<UploadMetadoc[]>([]);

// Config
const configLoading = ref(false);
const courseConfig = ref<CouchDoc | null>(null);
const showRawConfig = ref(false);

// Lesson card-type expand state: keys are "lessonId:cardType"
const expandedCardTypes = ref(new Set<string>());

function toggleCardType(lessonId: string, cardType: string) {
  const key = `${lessonId}:${cardType}`;
  if (expandedCardTypes.value.has(key)) {
    expandedCardTypes.value.delete(key);
  } else {
    expandedCardTypes.value.add(key);
  }
  expandedCardTypes.value = new Set(expandedCardTypes.value);
}

function isCardTypeExpanded(lessonId: string, cardType: string): boolean {
  return expandedCardTypes.value.has(`${lessonId}:${cardType}`);
}

const route = useRoute();

// Card inspect dialog
const inspectDialog = ref(false);
const inspectedCard = ref<EnrichedCard | null>(null);
const showRawCard = ref(false);

// ============================================================
// Lesson Audit Types & Helpers
// ============================================================

type SplitVowel = 'a' | 'e' | 'i' | 'o' | 'u';
const SPLIT_VOWELS: SplitVowel[] = ['a', 'e', 'i', 'o', 'u'];

interface VowelBucket {
  cardsByType: Record<string, number>;
  cardIdsByType: Record<string, string[]>;
  total: number;
}

interface LessonAuditEntry {
  lesson: LessonDefinition;
  isDeferred: boolean;
  cardsByType: Record<string, number>;
  cardIdsByType: Record<string, string[]>;
  totalCards: number;
  introCardIds: string[];
  prescribedIntroIds: string[];
  unprescribedIntroIds: string[];
  /** Populated only for the split-digraphs lesson — buckets cards by a_e/e_e/i_e/o_e/u_e. */
  vowelBreakdown?: Record<SplitVowel, VowelBucket>;
  /** Card IDs that couldn't be assigned to a vowel bucket (diagnostic). */
  vowelUnassigned?: string[];
}

/**
 * Extract the split-digraph vowel from a card ID.
 * Direct from ID when encoded (`c-split-intro-a_e-*`, `c-ws-*-split-a-*`,
 * `c-ws-*-(split|core)-a_e-*`); otherwise derived from the first vowel of
 * the word for ML / Spelling / core-only WS cards. Returns null if no
 * vowel can be determined (e.g. malformed ID, non-CVCe word).
 */
function extractSplitVowel(cardId: string): SplitVowel | null {
  let m = cardId.match(/^c-split-intro-([aeiou])_e-/);
  if (m) return m[1] as SplitVowel;
  m = cardId.match(/^c-wst-([aeiou])_e-/);
  if (m) return m[1] as SplitVowel;
  m = cardId.match(/^c-ws-[^-]+-(?:split|core)-([aeiou])(?:_e)?-/);
  if (m) return m[1] as SplitVowel;

  let word: string | null = null;
  if (cardId.startsWith('c-spelling-')) {
    word = cardId.slice('c-spelling-'.length);
  } else if (cardId.startsWith('c-ml-') || cardId.startsWith('c-ws-')) {
    word = cardId.split('-')[2] ?? null;
  }
  if (word) {
    const v = word.match(/[aeiou]/);
    if (v) return v[0] as SplitVowel;
  }
  return null;
}

function classifyCardId(id: string): string {
  if (id.startsWith('c-digraph-intro-')) return 'DigraphGpcIntro';
  if (id.startsWith('c-split-intro-')) return 'SplitDigraphIntro';
  if (id.startsWith('c-sight-intro-')) return 'SightWordIntro';
  if (id.startsWith('c-intro-')) return 'GpcIntro';
  if (id.startsWith('c-wst-')) return 'WhoSaidThat';
  if (id.startsWith('c-ws-')) return 'WordSelection';
  if (id.startsWith('c-ml-')) return 'MissingLetters';
  if (id.startsWith('c-spelling-')) return 'SpellingQuestion';
  return 'Other';
}

function getPrescribedCardIds(): Set<string> {
  const prescribed = strategies.value.find(
    (s) => s._id === 'NAVIGATION_STRATEGY-prescribed-bootstrap',
  );
  if (!prescribed) return new Set();
  try {
    const data = JSON.parse(prescribed.serializedData);
    const ids = new Set<string>();
    for (const group of data.groups || []) {
      for (const id of group.targetCardIds || []) {
        ids.add(id);
      }
    }
    return ids;
  } catch {
    return new Set();
  }
}

function buildLessonAudit(
  lesson: LessonDefinition,
  isDeferred: boolean,
  tagMap: Map<string, TagDoc>,
  prescribedIds: Set<string>,
): LessonAuditEntry {
  const allCardIds = new Set<string>();
  for (const conceptTag of lesson.gatesConceptTags) {
    const tagDoc = tagMap.get(conceptTag);
    if (tagDoc?.taggedCards) {
      for (const cardId of tagDoc.taggedCards) {
        allCardIds.add(cardId);
      }
    }
  }

  const byType: Record<string, number> = {};
  const idsByType: Record<string, string[]> = {};
  const introCardIds: string[] = [];

  for (const cardId of allCardIds) {
    const type = classifyCardId(cardId);
    byType[type] = (byType[type] || 0) + 1;
    if (!idsByType[type]) idsByType[type] = [];
    idsByType[type].push(cardId);
    if (type === 'GpcIntro' || type === 'DigraphGpcIntro' || type === 'SplitDigraphIntro' || type === 'SightWordIntro') {
      introCardIds.push(cardId);
    }
  }

  // Sort card IDs within each type for readability
  for (const type of Object.keys(idsByType)) {
    idsByType[type].sort();
  }

  introCardIds.sort();
  const prescribedIntros = introCardIds.filter((id) => prescribedIds.has(id));
  const unprescribedIntros = introCardIds.filter((id) => !prescribedIds.has(id));

  // Vowel-keyed sub-breakdown for the split-digraphs lesson.
  let vowelBreakdown: Record<SplitVowel, VowelBucket> | undefined;
  let vowelUnassigned: string[] | undefined;
  if (lesson.id === 'split-digraphs') {
    vowelBreakdown = {
      a: { cardsByType: {}, cardIdsByType: {}, total: 0 },
      e: { cardsByType: {}, cardIdsByType: {}, total: 0 },
      i: { cardsByType: {}, cardIdsByType: {}, total: 0 },
      o: { cardsByType: {}, cardIdsByType: {}, total: 0 },
      u: { cardsByType: {}, cardIdsByType: {}, total: 0 },
    };
    vowelUnassigned = [];
    for (const cardId of allCardIds) {
      const vowel = extractSplitVowel(cardId);
      if (!vowel) {
        vowelUnassigned.push(cardId);
        continue;
      }
      const bucket = vowelBreakdown[vowel];
      const type = classifyCardId(cardId);
      bucket.cardsByType[type] = (bucket.cardsByType[type] || 0) + 1;
      if (!bucket.cardIdsByType[type]) bucket.cardIdsByType[type] = [];
      bucket.cardIdsByType[type].push(cardId);
      bucket.total += 1;
    }
    for (const v of SPLIT_VOWELS) {
      for (const t of Object.keys(vowelBreakdown[v].cardIdsByType)) {
        vowelBreakdown[v].cardIdsByType[t].sort();
      }
    }
    vowelUnassigned.sort();
  }

  return {
    lesson,
    isDeferred,
    cardsByType: byType,
    cardIdsByType: idsByType,
    totalCards: allCardIds.size,
    introCardIds,
    prescribedIntroIds: prescribedIntros,
    unprescribedIntroIds: unprescribedIntros,
    vowelBreakdown,
    vowelUnassigned,
  };
}

// ============================================================
// Computed
// ============================================================

const summaryCards = computed(() => {
  if (!summary.value) return [];
  return [
    { label: 'Cards', value: summary.value.cardCount, color: 'primary' },
    { label: 'Data Docs', value: summary.value.dataDocCount, color: 'secondary' },
    { label: 'Tags', value: summary.value.tagCount, color: 'info' },
    { label: 'Strategies', value: summary.value.strategyCount, color: 'success' },
    { label: 'Upload Runs', value: summary.value.uploadMetaCount, color: 'warning' },
  ];
});

const lessonAudits = computed(() => {
  const tagMap = new Map<string, TagDoc>();
  for (const tag of allTags.value) {
    tagMap.set(tag.name, tag);
  }
  const prescribedIds = getPrescribedCardIds();

  return {
    active: LESSON_CATALOG.map((l) => buildLessonAudit(l, false, tagMap, prescribedIds)),
    deferred: DEFERRED_LESSON_CATALOG.map((l) => buildLessonAudit(l, true, tagMap, prescribedIds)),
  };
});

// Synthetic "lesson" for the holding tag, so the parked pool gets the same
// card-count audit as a real lesson. concept:unassigned has no lesson home.
const UNASSIGNED_PSEUDO_LESSON = {
  id: 'unassigned',
  title: 'Parked GPCs',
  description:
    'GPCs with no lesson home yet (igh, tch, dge, -le …). Suppressed by ' +
    'default-deny; recover with a one-line unlockedBy edit + content redeploy.',
  gatesConceptTags: [CONCEPT_UNASSIGNED],
} as unknown as LessonDefinition;

const unassignedAudit = computed((): LessonAuditEntry => {
  const tagMap = new Map<string, TagDoc>();
  for (const tag of allTags.value) tagMap.set(tag.name, tag);
  return buildLessonAudit(UNASSIGNED_PSEUDO_LESSON, true, tagMap, new Set());
});

// Live card count per GPC short-id, from the gpc:exercise|intro TAG docs.
const cardCountByShort = computed((): Map<string, number> => {
  const m = new Map<string, number>();
  for (const t of allTags.value) {
    const mt = t.name.match(/^gpc:(?:exercise|intro):(.+)$/);
    if (!mt) continue;
    m.set(mt[1], (m.get(mt[1]) ?? 0) + (t.taggedCards?.length ?? 0));
  }
  return m;
});

// Catalogue-driven parked pool: EVERY unassigned GPC (D7 — must surface even
// with zero cards), not just those that happen to carry deployed cards.
interface ParkedGpc {
  gpcId: string;
  grapheme: string;
  phoneme: string;
  category: string;
  examples: string[];
  cardCount: number;
}
// Catalogue → GPC rows grouped by what releases them (lesson id, or
// UNASSIGNED). Drives both the Parked pool and the deferred-lesson rosters —
// so every GPC a lesson releases is visible, including zero-card members the
// card-centric audit can't surface.
const gpcRowsByUnlockedBy = computed((): Map<string, ParkedGpc[]> => {
  const counts = cardCountByShort.value;
  const byKey = new Map<string, ParkedGpc[]>();
  for (const entry of GPC_CATALOGUE) {
    const a = assignmentFor(entry);
    if (!a) continue;
    const key = String(a.unlockedBy);
    const row: ParkedGpc = {
      gpcId: entry.id,
      grapheme: entry.grapheme,
      phoneme: entry.phoneme || '∅',
      category: entry.category,
      examples: a.examples ?? [],
      cardCount: counts.get(entry.id.slice('GPC-'.length)) ?? 0,
    };
    (byKey.get(key) ?? byKey.set(key, []).get(key)!).push(row);
  }
  for (const rows of byKey.values()) rows.sort((x, y) => x.gpcId.localeCompare(y.gpcId));
  return byKey;
});

const parkedGpcs = computed((): ParkedGpc[] => gpcRowsByUnlockedBy.value.get(UNASSIGNED) ?? []);

function gpcRowsForLesson(lessonId: string): ParkedGpc[] {
  return gpcRowsByUnlockedBy.value.get(lessonId) ?? [];
}

async function copyCurriculumFindings() {
  const lines = curriculumFindings.value.map((f) => {
    let s = `[${f.severity}] ${f.check}: ${f.message}`;
    if (f.items?.length) s += '\n  ' + f.items.join('\n  ');
    return s;
  });
  await navigator.clipboard.writeText(lines.join('\n'));
}

function formatGpcRows(label: string, rows: ParkedGpc[]): string {
  const lines = rows.map(
    (p) =>
      `${p.gpcId}\t${p.grapheme}→${p.phoneme}\t${p.cardCount} cards` +
      (p.examples.length ? `\t${p.examples.join(', ')}` : ''),
  );
  return [`${label} (${rows.length}):`, ...lines].join('\n');
}

async function copyParkedGpcs() {
  await navigator.clipboard.writeText(
    formatGpcRows('Parked / unassigned GPCs', parkedGpcs.value),
  );
}

async function copyLessonGpcs(lessonId: string) {
  await navigator.clipboard.writeText(
    formatGpcRows(`GPCs released by ${lessonId}`, gpcRowsForLesson(lessonId)),
  );
}

// P4.1 consistency checks rendered live against the loaded TAG / strategy docs.
// WordSelection traceability is skipped client-side (no word data) — the check
// reports the skip count.
const curriculumFindings = computed((): Finding[] => {
  if (allTags.value.length === 0) return [];
  const cardTags = invertTagDocs(allTags.value);
  const cards = [...cardTags].map(([id, tags]) => ({ id, tags }));
  const conceptTagNames = allTags.value
    .map((t) => t.name)
    .filter((n) => n.startsWith('concept:'));
  return runCurriculumChecks(buildExpectedTopology(), {
    cards,
    conceptTagNames,
    strategies: strategies.value.map((s) => ({
      id: s._id,
      implementingClass: s.implementingClass,
    })),
  });
});

const curriculumErrorCount = computed(
  () => curriculumFindings.value.filter((f) => f.severity === 'error').length,
);
const curriculumWarnCount = computed(
  () => curriculumFindings.value.filter((f) => f.severity === 'warn').length,
);

function findingIcon(sev: Severity): string {
  return sev === 'error'
    ? 'mdi-close-circle'
    : sev === 'warn'
      ? 'mdi-alert'
      : 'mdi-check-circle';
}
function findingColor(sev: Severity): string {
  return sev === 'error' ? 'error' : sev === 'warn' ? 'warning' : 'success';
}

const questionTypeItems = computed(() => {
  if (!summary.value) return [];
  return Object.keys(summary.value.cardsByType).map((qt) => ({
    title: `${qt} (${summary.value!.cardsByType[qt]})`,
    value: qt,
  }));
});

const filteredCards = computed(() => {
  // The enriched cards are already filtered by the API-level filters (questionType, tag).
  // The cardSearch is applied client-side by the v-data-table's :search prop.
  return enrichedCards.value;
});

const cardHeaders = [
  { title: 'ID', key: '_id', width: '200px' },
  { title: 'Type', key: 'questionType', width: '150px' },
  { title: 'Data', key: 'data', sortable: false },
  { title: 'Tags', key: 'tags', sortable: false, width: '400px' },
  { title: 'ELO', key: 'elo', width: '100px' },
  { title: '', key: 'actions', width: '50px', sortable: false },
];

// Tags tab
const tagCategoryItems = computed(() => {
  if (allTags.value.length === 0) return [];
  const categories = new Set<string>();
  for (const tag of allTags.value) {
    const { category } = categorizeTag(tag.name);
    categories.add(category);
  }
  return Array.from(categories).sort().map((c) => ({ title: c, value: c }));
});

const filteredGroupedTags = computed(() => {
  let filtered = allTags.value;

  if (tagCategoryFilter.value) {
    filtered = filtered.filter((t) => {
      const { category } = categorizeTag(t.name);
      return category === tagCategoryFilter.value;
    });
  }

  if (tagSearch.value) {
    const q = tagSearch.value.toLowerCase();
    filtered = filtered.filter((t) => t.name.toLowerCase().includes(q));
  }

  const grouped: Record<string, TagDoc[]> = {};
  for (const tag of filtered) {
    const { category } = categorizeTag(tag.name);
    if (!grouped[category]) grouped[category] = [];
    grouped[category].push(tag);
  }

  // Sort entries within each category
  for (const cat of Object.keys(grouped)) {
    grouped[cat].sort((a, b) => a.name.localeCompare(b.name));
  }

  return grouped;
});

// CourseConfig computed properties
const courseConfigDataShapes = computed(() => {
  if (!courseConfig.value) return [];
  return (courseConfig.value as any).dataShapes || [];
});

const courseConfigQuestionTypes = computed(() => {
  if (!courseConfig.value) return [];
  return (courseConfig.value as any).questionTypes || [];
});

// ============================================================
// Methods
// ============================================================

function vowelTableTypes(
  breakdown: Record<SplitVowel, VowelBucket>,
): string[] {
  const order = [
    'SplitDigraphIntro',
    'WordSelection',
    'MissingLetters',
    'SpellingQuestion',
    'WhoSaidThat',
    'GpcIntro',
    'DigraphGpcIntro',
    'Other',
  ];
  const present = new Set<string>();
  for (const v of SPLIT_VOWELS) {
    for (const t of Object.keys(breakdown[v].cardsByType)) present.add(t);
  }
  return order.filter((t) => present.has(t));
}

function questionTypeColor(qType: string): string {
  const colors: Record<string, string> = {
    SpellingQuestion: 'deep-purple',
    WhoSaidThat: 'teal',
    WordSelection: 'orange',
    MissingLetters: 'blue-grey',
    GpcIntro: 'indigo',
    DigraphGpcIntro: 'cyan',
    SplitDigraphIntro: 'light-blue',
    SightWordIntro: 'purple',
    Other: 'grey',
  };
  return colors[qType] || 'grey';
}

function tagColor(tagName: string): string {
  const { category } = categorizeTag(tagName);
  const colors: Record<string, string> = {
    gpc: 'blue',
    ui: 'purple',
    concept: 'green',
  };
  return colors[category] || 'grey';
}

function categoryIcon(category: string): string {
  const icons: Record<string, string> = {
    gpc: 'mdi-alphabetical',
    ui: 'mdi-monitor',
    concept: 'mdi-lightbulb',
  };
  return icons[category] || 'mdi-tag';
}

function formatDataFields(fields: Record<string, unknown>): string {
  const entries = Object.entries(fields);
  if (entries.length === 0) return '—';
  return entries
    .map(([k, v]) => {
      const val = typeof v === 'string' ? v : JSON.stringify(v);
      const truncated = val.length > 40 ? val.slice(0, 37) + '...' : val;
      return `${k}: ${truncated}`;
    })
    .join(' | ');
}

function formatDate(dateStr: string | undefined): string {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

function formatStrategyData(serialized: string): string {
  try {
    const parsed = JSON.parse(serialized);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return serialized;
  }
}

function toggleStrategyData(id: string) {
  if (expandedStrategies.value.has(id)) {
    expandedStrategies.value.delete(id);
  } else {
    expandedStrategies.value.add(id);
  }
  // Trigger reactivity
  expandedStrategies.value = new Set(expandedStrategies.value);
}

function inspectCard(card: EnrichedCard) {
  inspectedCard.value = card;
  showRawCard.value = false;
  inspectDialog.value = true;
}

function cardSearchFilter(value: unknown, query: string, item: any): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  const enriched: EnrichedCard = item.raw || item;
  const cardId = enriched.card?._id || '';
  const dataStr = JSON.stringify(enriched.dataFields || {}).toLowerCase();
  const tagStr = (enriched.tags || []).join(' ').toLowerCase();
  return (
    cardId.toLowerCase().includes(q) ||
    dataStr.includes(q) ||
    tagStr.includes(q) ||
    (enriched.questionType || '').toLowerCase().includes(q)
  );
}

// ============================================================
// Copy helpers
// ============================================================

function cardHref(cardId: string): string {
  return `/admin/content?tab=cards&q=${encodeURIComponent(cardId)}`;
}

async function copyLessonText(entry: LessonAuditEntry) {
  const lines: string[] = [];
  lines.push(`${entry.lesson.title} (${entry.lesson.id})`);
  if (entry.lesson.description) lines.push(entry.lesson.description);
  if (entry.lesson.gatesConceptTags?.length) {
    lines.push(`Gates: ${entry.lesson.gatesConceptTags.join(', ')}`);
  }
  const prereqs = entry.lesson.availabilityConditions?.masteryPrereqs;
  if (prereqs?.length) {
    const parts = prereqs.map((p: any) => {
      let s = p.tag;
      if (p.minCount) s += ` ≥${p.minCount}x`;
      if (p.minElo) s += ` ELO≥${p.minElo}`;
      return s;
    });
    lines.push(`Availability prereqs: ${parts.join(', ')}`);
  }
  if (entry.lesson.prerequisites?.length) {
    lines.push(`After: ${entry.lesson.prerequisites.join(', ')}`);
  }
  if (entry.totalCards > 0) {
    const typeCounts = Object.entries(entry.cardsByType)
      .map(([t, c]) => `${t}: ${c}`)
      .join(', ');
    lines.push(`Cards: ${typeCounts} — Total: ${entry.totalCards}`);
  }
  if (entry.introCardIds.length > 0) {
    const prescribed = entry.prescribedIntroIds;
    const unprescribed = entry.unprescribedIntroIds;
    const summary = `Intro cards (${entry.introCardIds.length} total, ${prescribed.length} prescribed)`;
    if (prescribed.length) {
      lines.push(`${summary}\n  Prescribed: ${prescribed.join(', ')}`
        + (unprescribed.length ? `\n  Unprescribed: ${unprescribed.join(', ')}` : ''));
    } else {
      lines.push(`${summary}\n  None prescribed — ${unprescribed.join(', ')}`);
    }
  }
  await navigator.clipboard.writeText(lines.join('\n'));
}

async function copyQTypeText(entry: LessonAuditEntry, type: string) {
  const ids = entry.cardIdsByType[type] || [];
  await navigator.clipboard.writeText(`${type} (${ids.length}):\n${ids.join('\n')}`);
}

// ============================================================
// Data Loading
// ============================================================

async function loadSummary() {
  try {
    summary.value = await getContentSummary();
    connectionError.value = null;
  } catch (err) {
    connectionError.value = err instanceof Error ? err.message : String(err);
  }
}

async function loadCards() {
  cardsLoading.value = true;
  try {
    enrichedCards.value = await getEnrichedCards({
      questionType: cardFilters.questionType || undefined,
      tag: cardFilters.tag || undefined,
    });
  } catch (err) {
    console.error('[AdminContent] Failed to load cards:', err);
  } finally {
    cardsLoading.value = false;
  }
}

async function loadOrphans() {
  orphansLoading.value = true;
  try {
    orphanCards.value = await getOrphanCards();
  } catch (err) {
    console.error('[AdminContent] Failed to scan for orphan cards:', err);
  } finally {
    orphansLoading.value = false;
  }
}

async function deleteOrphans() {
  orphanDeleting.value = true;
  orphanResult.value = null;
  try {
    // Delete each stale card AND its displayable-data doc.
    const ids = orphanCards.value.flatMap((o) => [o.cardId, o.ddId]);
    const { deleted, failed } = await deleteDocsById(ids);
    orphanResult.value =
      `Deleted ${deleted.length} document(s)` +
      (failed.length ? ` — ${failed.length} failed: ${failed.map((f) => f.id).join(', ')}` : '.');
    confirmOrphanDialog.value = false;
    // Refresh the scan + the summary counts.
    await Promise.all([loadOrphans(), loadSummary()]);
  } catch (err) {
    orphanResult.value = `Delete failed: ${err instanceof Error ? err.message : String(err)}`;
  } finally {
    orphanDeleting.value = false;
  }
}

async function loadTags() {
  tagsLoading.value = true;
  try {
    allTags.value = await getTags();
  } catch (err) {
    console.error('[AdminContent] Failed to load tags:', err);
  } finally {
    tagsLoading.value = false;
  }
}

async function loadStrategies() {
  strategiesLoading.value = true;
  try {
    strategies.value = await getStrategies();
  } catch (err) {
    console.error('[AdminContent] Failed to load strategies:', err);
  } finally {
    strategiesLoading.value = false;
  }
}

async function loadUploads() {
  uploadsLoading.value = true;
  try {
    uploadMetadocs.value = await getUploadMetadocs();
  } catch (err) {
    console.error('[AdminContent] Failed to load upload metadocs:', err);
  } finally {
    uploadsLoading.value = false;
  }
}

async function loadConfig() {
  configLoading.value = true;
  try {
    courseConfig.value = await getCourseConfig();
  } catch (err) {
    console.error('[AdminContent] Failed to load CourseConfig:', err);
  } finally {
    configLoading.value = false;
  }
}

async function refreshAll() {
  refreshing.value = true;
  try {
    await loadSummary();
    // Load data for all tabs in parallel
    await Promise.all([
      loadCards(),
      loadOrphans(),
      loadTags(),
      loadStrategies(),
      loadUploads(),
      loadConfig(),
    ]);
  } finally {
    refreshing.value = false;
  }
}

// ============================================================
// Lifecycle
// ============================================================

onMounted(async () => {
  if (route.query.tab) activeTab.value = route.query.tab as string;
  // ?lesson=<id> implies the lessons tab (deep links from /dbg/lesson)
  else if (route.query.lesson) activeTab.value = 'lessons';
  if (route.query.q) cardSearch.value = route.query.q as string;
  loading.value = true;
  try {
    await loadSummary();
    // Eagerly load all tabs in parallel for fast switching
    await Promise.all([
      loadCards(),
      loadOrphans(),
      loadTags(),
      loadStrategies(),
      loadUploads(),
      loadConfig(),
    ]);
  } finally {
    loading.value = false;
  }
  if (route.query.lesson && activeTab.value === 'lessons') {
    await nextTick();
    focusLessonAudit(String(route.query.lesson));
  }
});

/**
 * Scroll a lesson's audit card into view and pulse it — target of
 * `?lesson=<id>` deep links. Keyed by lesson id, which both this view's
 * `lessonAudits` and the dbg lesson viewer derive from the same
 * LESSON_CATALOG / DEFERRED_LESSON_CATALOG arrays (ids policed against the
 * curriculum registry by the pipeline's registry-twins invariant).
 */
function focusLessonAudit(lessonId: string): void {
  const el = document.getElementById(`lesson-audit-${lessonId}`);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  el.classList.add('lesson-audit--focused');
  setTimeout(() => el.classList.remove('lesson-audit--focused'), 2400);
}
</script>

<style scoped>
.admin-content {
  max-width: 1600px;
}

code {
  font-size: 0.85em;
  padding: 1px 4px;
  border-radius: 3px;
  background: rgba(0, 0, 0, 0.04);
}

/* Deep-link focus pulse (?lesson=<id>) */
.lesson-audit--focused > .v-card {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: 2px;
  transition: outline-color 0.4s ease;
}

pre {
  white-space: pre-wrap;
  word-break: break-word;
}
</style>