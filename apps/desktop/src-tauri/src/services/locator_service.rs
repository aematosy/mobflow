use std::collections::HashMap;
use std::time::{Duration, Instant};

use crate::models::spy::LocatorCandidate;
use crate::services::appium_client;

const MAX_CANDIDATES: usize = 4;

const MAX_SYNC_RELATIONAL_CANDIDATES: usize = 6;

const LOCATOR_ANALYSIS_DEADLINE: Duration = Duration::from_secs(4);

const MAX_LOCATOR_REQUESTS: usize = 12;

#[derive(Debug)]
struct LocatorAnalysisContext {
    started: Instant,
    deadline: Duration,
    max_requests: usize,
    requests: usize,
    cache: HashMap<String, Result<usize, String>>,
}

impl LocatorAnalysisContext {
    fn new() -> Self {
        Self {
            started: Instant::now(),
            deadline: LOCATOR_ANALYSIS_DEADLINE,
            max_requests: MAX_LOCATOR_REQUESTS,
            requests: 0,
            cache: HashMap::new(),
        }
    }

    fn elapsed(&self) -> Duration {
        self.started.elapsed()
    }

    fn expired(&self) -> bool {
        self.elapsed() >= self.deadline
    }

    fn exhausted(&self) -> bool {
        self.requests >= self.max_requests
    }

    fn can_request(&self) -> bool {
        !self.expired() && !self.exhausted()
    }

    fn request_count(&self) -> usize {
        self.requests
    }

    fn cache_size(&self) -> usize {
        self.cache.len()
    }

    fn cache_key(strategy: &str, selector: &str) -> String {
        format!("{strategy}\u{1f}{selector}")
    }

    fn match_count(
        &mut self,
        session_id: &str,
        strategy: &str,
        selector: &str,
    ) -> Result<usize, String> {
        let key = Self::cache_key(strategy, selector);

        if let Some(result) = self.cache.get(&key) {
            return result.clone();
        }

        if self.expired() {
            return Err("Locator analysis deadline reached".to_string());
        }

        if self.exhausted() {
            return Err("Locator analysis request budget exhausted".to_string());
        }

        self.requests += 1;

        let request_number = self.requests;

        crate::services::log_service::info(
            "locator",
            format!(
                "LOCATOR REQUEST #{}/{} [{}] {}",
                request_number, self.max_requests, strategy, selector,
            ),
        );

        let result = appium_client::locator_match_count(session_id, strategy, selector);

        match &result {
            Ok(match_count) => {
                crate::services::log_service::info(
                    "locator",
                    format!("LOCATOR RESULT #{request_number}: MATCH {match_count}"),
                );
            }

            Err(error) => {
                crate::services::log_service::error(
                    "locator",
                    format!("LOCATOR RESULT #{request_number}: ERROR {error}"),
                );
            }
        }

        self.cache.insert(key, result.clone());

        result
    }
}

struct Candidate {
    strategy: &'static str,
    value: String,
    score: u8,
    reason: &'static str,
    category: &'static str,

    /*
     * Optional reusable locator metadata.
     *
     * value:
     *   concrete locator verified against the live session.
     *
     * template:
     *   reusable version of the same locator.
     *
     * parameter_name / parameter_example:
     *   describe the semantic value replaced in template.
     */
    template: Option<String>,
    parameter_name: Option<String>,
    parameter_example: Option<String>,
}

fn meaningful(value: &str) -> bool {
    let value = value.trim();

    !value.is_empty() && value != "null" && value != "undefined"
}

fn looks_dynamic(value: &str) -> bool {
    let value = value.trim();

    if value.is_empty() {
        return true;
    }

    let digits = value
        .chars()
        .filter(|character| character.is_ascii_digit())
        .count();

    let long_hex = value
        .split(|character: char| !character.is_ascii_hexdigit())
        .any(|part| part.len() >= 12 && part.chars().any(|c| c.is_ascii_digit()));

    long_hex || (value.len() > 8 && digits * 2 > value.len())
}

/*
 * Locator quality is not the same as MATCH 1.
 *
 * MATCH 1 proves uniqueness in the current live hierarchy.
 * Quality estimates how suitable the locator is for reuse.
 */
fn locator_quality(candidate: &Candidate) -> (u8, bool) {
    let category = candidate.category;

    let strategy = candidate.strategy;

    /*
     * Start from the generator's contextual knowledge,
     * but cap old absolute scores. No strategy receives
     * 100 merely because of its type.
     */
    let mut score = candidate.score.min(94);

    let mut stable = false;

    match strategy {
        "id" => {
            score = score.max(92);
            stable = true;
        }

        "accessibility-id" => {
            /*
             * Accessibility is excellent when it represents
             * semantic identity, but MATCH 1 alone does not
             * prove that it identifies a business item.
             */
            score = score.clamp(82, 92);
            stable = true;
        }

        "android-uiautomator" => {
            if candidate.value.contains(".resourceId(") {
                score = score.clamp(88, 91);
                stable = true;
            } else if candidate.value.contains(".description(") {
                score = score.clamp(82, 89);
                stable = true;
            } else if candidate.value.contains(".text(") {
                score = score.clamp(76, 84);
                stable = false;
            } else {
                score = score.min(80);
            }
        }

        "xpath" => {
            if category == "relational-local-context-compact" {
                /*
                 * Preferred contextual locator:
                 *
                 * itemName -> typed local component -> target.
                 *
                 * This variant already passed MATCH 1 and is
                 * intentionally preferred for maintainability.
                 */
                score = if candidate.template.is_some() { 94 } else { 92 };

                stable = true;
            } else if category == "relational-local-context" {
                /*
                 * Cardinality-safe contextual fallback.
                 *
                 * Slightly lower than the verified compact
                 * variant because it is more verbose.
                 */
                score = if candidate.template.is_some() { 92 } else { 90 };

                stable = true;
            } else if category == "relational-parameterized" {
                score = if candidate.template.is_some() { 88 } else { 84 };

                stable = true;
            } else if category.contains("sibling") {
                score = score.min(76);
                stable = false;
            } else if category.contains("ancestor") {
                score = score.min(80);
                stable = false;
            } else {
                score = score.min(82);
                stable = false;
            }
        }

        _ => {
            score = score.min(78);
        }
    }

    /*
     * A reusable semantic template is positive evidence,
     * but never enough to turn a weak locator into 100.
     */
    if candidate.template.is_some() && score < 94 {
        score = score.saturating_add(2).min(94);
    }

    (score, stable)
}

fn validate(
    session_id: &str,
    candidates: Vec<Candidate>,
    context: &mut LocatorAnalysisContext,
) -> Vec<LocatorCandidate> {
    let mut verified = Vec::new();

    for candidate in candidates {
        if looks_dynamic(&candidate.value) {
            continue;
        }

        /*
         * TestFlow locator safety rules.
         *
         * Reject absolute hierarchy locators and explicit
         * positional indexes before Appium validation.
         */
        if candidate.strategy == "xpath" {
            let value = candidate.value.trim();

            if value.starts_with("/hierarchy/")
                || value.starts_with("//hierarchy/")
                || value.contains("[1]")
                || value.contains("[2]")
                || value.contains("[3]")
                || value.contains("[4]")
                || value.contains("[5]")
                || value.contains("[6]")
                || value.contains("[7]")
                || value.contains("[8]")
                || value.contains("[9]")
            {
                continue;
            }
        }

        if !context.can_request() {
            break;
        }

        let Ok(match_count) = context.match_count(session_id, candidate.strategy, &candidate.value)
        else {
            continue;
        };

        // TestFlow invariant:
        // candidates MUST resolve exactly one element.
        if match_count != 1 {
            continue;
        }

        let (quality_score, stable) = locator_quality(&candidate);

        verified.push(LocatorCandidate {
            strategy: candidate.strategy.to_string(),
            value: candidate.value,
            score: quality_score,
            recommended: false,
            reason: candidate.reason.to_string(),
            match_count: Some(1),
            unique: true,
            stable,
            category: candidate.category.to_string(),
            template: candidate.template,
            parameter_name: candidate.parameter_name,
            parameter_example: candidate.parameter_example,
        });
    }

    verified.sort_by(|left, right| right.score.cmp(&left.score));

    verified.dedup_by(|left, right| left.strategy == right.strategy && left.value == right.value);

    verified.truncate(MAX_CANDIDATES);

    if let Some(best) = verified.first_mut() {
        best.recommended = true;
    }

    verified
}

/*
 * MATCH 1 means unique in the current hierarchy.
 * It does not necessarily identify the business item.
 *
 * Visual targets without their own visible semantic text
 * may need a local contextual anchor even when a generic
 * accessibility-id/resource-id happens to be unique now.
 */
fn locator_needs_context(target: &crate::models::spy::MobileElementSnapshot) -> bool {
    let element_type = target.element_type.to_ascii_lowercase();

    let visual_target = element_type.contains("image") || element_type.contains("view");

    if !visual_target {
        return false;
    }

    /*
     * Own visible text is already semantic identity.
     */
    if target
        .text
        .as_deref()
        .is_some_and(|value| meaningful(value) && !looks_dynamic(value))
    {
        return false;
    }

    /*
     * A visual child inside a component/list/card should
     * continue to contextual analysis so TestFlow can
     * identify WHICH item owns the visual target.
     */
    target.parent_id.is_some()
}

fn android_candidates(
    session_id: &str,
    context: &mut LocatorAnalysisContext,
    text: Option<&str>,
    resource_id: Option<&str>,
    accessibility_id: Option<&str>,
) -> Vec<LocatorCandidate> {
    /*
     * DIRECT ANDROID STRATEGY
     *
     * Priority is intentional:
     *
     * 1. accessibility-id
     * 2. resource-id
     * 3. UiAutomator resource-id
     * 4. UiAutomator accessibility description
     * 5. visible text
     *
     * Each candidate is independently validated against
     * the live Appium session and accepted only MATCH == 1.
     */
    let mut candidates = Vec::new();

    if let Some(value) = accessibility_id.filter(|value| meaningful(value)) {
        candidates.push(Candidate {
            strategy: "accessibility-id",
            value: value.to_string(),
            score: 100,
            reason: "Verified semantic accessibility identifier",
            category: "semantic",
            template: None,
            parameter_name: None,
            parameter_example: None,
        });
    }

    if let Some(value) = resource_id.filter(|value| meaningful(value)) {
        candidates.push(Candidate {
            strategy: "id",
            value: value.to_string(),
            score: 98,
            reason: "Verified native Android resource identifier",
            category: "native",
            template: None,
            parameter_name: None,
            parameter_example: None,
        });

        candidates.push(Candidate {
            strategy: "android-uiautomator",
            value: format!("new UiSelector().resourceId({:?})", value,),
            score: 96,
            reason: "Verified native UiAutomator resource selector",
            category: "native",
            template: None,
            parameter_name: None,
            parameter_example: None,
        });
    }

    if let Some(value) = accessibility_id.filter(|value| meaningful(value)) {
        candidates.push(Candidate {
            strategy: "android-uiautomator",
            value: format!("new UiSelector().description({:?})", value,),
            score: 94,
            reason: "Verified native UiAutomator accessibility selector",
            category: "native",
            template: None,
            parameter_name: None,
            parameter_example: None,
        });
    }

    if let Some(value) = text.filter(|value| meaningful(value)) {
        candidates.push(Candidate {
            strategy: "android-uiautomator",
            value: format!("new UiSelector().text({:?})", value,),
            score: 84,
            reason: "Verified visible-text UiAutomator selector",
            category: "semantic",
            template: None,
            parameter_name: None,
            parameter_example: None,
        });
    }

    validate(session_id, candidates, context)
}

fn xpath_literal(value: &str) -> String {
    if !value.contains('\'') {
        return format!("'{value}'");
    }

    if !value.contains('"') {
        return format!("\"{value}\"");
    }

    let parts = value
        .split('\'')
        .map(|part| format!("'{part}'"))
        .collect::<Vec<_>>();

    format!("concat({})", parts.join(", \"'\", "))
}

fn xpath_type(element_type: &str) -> Option<&str> {
    let value = element_type.trim();

    if value.is_empty() || value == "*" || value.contains('[') || value.contains(']') {
        None
    } else {
        Some(value)
    }
}

fn android_anchor_predicate(element: &crate::models::spy::MobileElementSnapshot) -> Option<String> {
    if let Some(value) = element
        .accessibility_id
        .as_deref()
        .filter(|value| meaningful(value) && !looks_dynamic(value))
    {
        return Some(format!("@content-desc={}", xpath_literal(value),));
    }

    if let Some(value) = element
        .resource_id
        .as_deref()
        .filter(|value| meaningful(value) && !looks_dynamic(value))
    {
        return Some(format!("@resource-id={}", xpath_literal(value),));
    }

    if let Some(value) = element
        .text
        .as_deref()
        .filter(|value| meaningful(value) && !looks_dynamic(value))
    {
        return Some(format!("@text={}", xpath_literal(value),));
    }

    None
}

fn android_target_predicate(element: &crate::models::spy::MobileElementSnapshot) -> Option<String> {
    android_anchor_predicate(element)
}

fn merge_verified(existing: &mut Vec<LocatorCandidate>, mut additions: Vec<LocatorCandidate>) {
    existing.append(&mut additions);

    existing.sort_by(|left, right| right.score.cmp(&left.score));

    existing.dedup_by(|left, right| left.strategy == right.strategy && left.value == right.value);

    existing.truncate(MAX_CANDIDATES);

    for locator in existing.iter_mut() {
        locator.recommended = false;
    }

    if let Some(best) = existing.first_mut() {
        best.recommended = true;
    }
}

/*
 * ==========================================================
 * CONTEXTUAL ANDROID LOCATOR ENGINE V2
 * ==========================================================
 *
 * Rules:
 * - no positional indexes;
 * - no absolute hierarchy XPath;
 * - no wildcard target/ancestor selectors;
 * - semantic anchors must be proven MATCH 1;
 * - all Appium checks share LocatorAnalysisContext;
 * - exploration is intentionally bounded.
 */

/*
 * Returns the ancestry from immediate parent upwards.
 * No positional XPath is generated here.
 */
fn ancestor_chain<'a>(
    element: &'a crate::models::spy::MobileElementSnapshot,
    snapshot: &'a [crate::models::spy::MobileElementSnapshot],
) -> Vec<&'a crate::models::spy::MobileElementSnapshot> {
    let mut result = Vec::new();

    let mut current = element.parent_id.as_deref();

    while let Some(parent_id) = current {
        let Some(parent) = snapshot.iter().find(|candidate| candidate.id == parent_id) else {
            break;
        };

        result.push(parent);

        current = parent.parent_id.as_deref();
    }

    result
}

fn is_descendant_of(
    element: &crate::models::spy::MobileElementSnapshot,
    ancestor_id: &str,
    snapshot: &[crate::models::spy::MobileElementSnapshot],
) -> bool {
    let mut current = element.parent_id.as_deref();

    while let Some(parent_id) = current {
        if parent_id == ancestor_id {
            return true;
        }

        let Some(parent) = snapshot.iter().find(|candidate| candidate.id == parent_id) else {
            break;
        };

        current = parent.parent_id.as_deref();
    }

    false
}

/*
 * Finds the nearest shared component containing both
 * semantic anchor and ambiguous target.
 */
/*
 * Semantic anchors must describe something meaningful
 * to a user/test and must not be the target itself.
 */
fn contextual_semantic_value(
    element: &crate::models::spy::MobileElementSnapshot,
) -> Option<(&'static str, &str)> {
    if let Some(value) = element
        .text
        .as_deref()
        .filter(|value| meaningful(value) && !looks_dynamic(value))
    {
        return Some(("text", value));
    }

    if let Some(value) = element
        .accessibility_id
        .as_deref()
        .filter(|value| meaningful(value) && !looks_dynamic(value))
    {
        return Some(("content-desc", value));
    }

    None
}

fn semantic_anchor_xpath(
    element: &crate::models::spy::MobileElementSnapshot,
) -> Option<(String, &'static str, String)> {
    let (attribute, value) = contextual_semantic_value(element)?;

    let element_type = xpath_type(&element.element_type).unwrap_or("*");

    let selector = format!("//{element_type}[@{attribute}={}]", xpath_literal(value),);

    Some((selector, attribute, value.to_string()))
}

fn contextual_target_predicate_v4(
    target: &crate::models::spy::MobileElementSnapshot,
) -> Option<String> {
    if let Some(value) = target
        .resource_id
        .as_deref()
        .filter(|value| meaningful(value) && !looks_dynamic(value))
    {
        return Some(format!("@resource-id={}", xpath_literal(value),));
    }

    if let Some(value) = target
        .accessibility_id
        .as_deref()
        .filter(|value| meaningful(value) && !looks_dynamic(value))
    {
        return Some(format!("@content-desc={}", xpath_literal(value),));
    }

    if let Some(value) = target
        .text
        .as_deref()
        .filter(|value| meaningful(value) && !looks_dynamic(value))
    {
        return Some(format!("@text={}", xpath_literal(value),));
    }

    None
}

/*
 * Context V4
 *
 * ambiguous target
 *      ↓
 * unique semantic anchor
 *      ↓
 * nearest shared component
 *      ↓
 * target inside that component
 *
 * No absolute hierarchy.
 * No numeric indexes.
 * No application-specific assumptions.
 */

fn same_local_component(
    target: &crate::models::spy::MobileElementSnapshot,
    anchor: &crate::models::spy::MobileElementSnapshot,
    snapshot: &[crate::models::spy::MobileElementSnapshot],
) -> bool {
    /*
     * Contextual anchors are only valid when the target
     * and anchor share a reasonably local ancestor.
     *
     * This prevents unrelated menu entries such as
     * "QR Code Scanner" from becoming the semantic anchor
     * of "Geo Location".
     */
    let target_ancestors = ancestor_chain(target, snapshot);

    let anchor_ancestors = ancestor_chain(anchor, snapshot);

    target_ancestors.iter().take(4).any(|target_ancestor| {
        anchor_ancestors
            .iter()
            .take(4)
            .any(|anchor_ancestor| target_ancestor.id == anchor_ancestor.id)
    })
}

/*
 * LOCAL SEMANTIC CONTEXT
 *
 * Resolves repeated/anonymous targets through the nearest
 * component that contains both:
 *
 *   1. the selected target
 *   2. a meaningful semantic anchor
 *
 * The search starts at the target parent and walks upward.
 * The first ancestor capable of expressing a MATCH-1
 * relationship wins.
 *
 * No application-specific names, ids or indexes are used.
 */
fn local_semantic_context_candidates(
    target: &crate::models::spy::MobileElementSnapshot,
    snapshot: &[crate::models::spy::MobileElementSnapshot],
) -> Vec<Candidate> {
    let Some(target_type) = xpath_type(&target.element_type) else {
        return Vec::new();
    };

    let Some(target_predicate) = android_target_predicate(target) else {
        return Vec::new();
    };

    let mut result = Vec::new();
    let mut ancestor_id = target.parent_id.clone();

    /*
     * Local only. Never walk the complete application tree.
     */
    for depth in 0..4usize {
        let Some(current_id) = ancestor_id.clone() else {
            break;
        };

        let Some(component) = snapshot.iter().find(|element| element.id == current_id) else {
            break;
        };

        let Some(component_type) = xpath_type(&component.element_type) else {
            ancestor_id = component.parent_id.clone();
            continue;
        };

        /*
         * Candidate anchor quality:
         *
         * 0 = descriptive visible text
         * 1 = semantic accessibility
         * 2 = numeric / price-like visible text
         *
         * This prevents "$ 29.99" from beating a product
         * name merely because it is physically closer.
         */
        let mut anchors = snapshot
            .iter()
            .filter(|candidate| {
                candidate.id != target.id && is_descendant_of(candidate, &component.id, snapshot)
            })
            .filter_map(|candidate| {
                let anchor_type = xpath_type(&candidate.element_type)?;

                if let Some(value) = candidate
                    .text
                    .as_deref()
                    .filter(|value| meaningful(value) && !looks_dynamic(value))
                {
                    let trimmed = value.trim();

                    let numeric_chars = trimmed
                        .chars()
                        .filter(|c| {
                            c.is_ascii_digit()
                                || matches!(c, '.' | ',' | '$' | '€' | '£' | '¥' | ' ')
                        })
                        .count();

                    let price_like = !trimmed.is_empty()
                        && numeric_chars * 100 / trimmed.chars().count().max(1) >= 70;

                    return Some((
                        candidate,
                        anchor_type,
                        "text",
                        value,
                        if price_like { 2u8 } else { 0u8 },
                    ));
                }

                candidate
                    .accessibility_id
                    .as_deref()
                    .filter(|value| meaningful(value) && !looks_dynamic(value))
                    .map(|value| (candidate, anchor_type, "content-desc", value, 1u8))
            })
            .collect::<Vec<_>>();

        /*
         * Semantic quality first, proximity second.
         */
        anchors.sort_by(
            |(left, _, _, _, left_quality), (right, _, _, _, right_quality)| {
                left_quality.cmp(right_quality).then_with(|| {
                    left.index
                        .abs_diff(target.index)
                        .cmp(&right.index.abs_diff(target.index))
                })
            },
        );

        for (_anchor, anchor_type, anchor_attribute, anchor_value, _) in anchors {
            let anchor_literal = xpath_literal(anchor_value);

            /*
             * IMPORTANT:
             * Use the real Android class for semantic anchors.
             *
             * Avoid wildcard anchor selectors.
             * Prefer typed selectors such as TextView.
             */
            let anchor_selector = format!("//{anchor_type}[@{anchor_attribute}={anchor_literal}]");

            let parameter_name = if locator_needs_context(target) {
                "itemName"
            } else {
                "anchorValue"
            };

            /*
             * COMPACT candidate.
             *
             * Easier to read and maintain. It is NOT trusted
             * merely because it is shorter: validate() still
             * requires MATCH 1 against the live Appium session.
             */
            let compact = format!(
                "{anchor_selector}/ancestor::{component_type}[.//{target_type}[{target_predicate}]]//{target_type}[{target_predicate}]"
            );

            let compact_template = format!(
                "//{anchor_type}[@{anchor_attribute}=${{{parameter_name}}}]/ancestor::{component_type}[.//{target_type}[{target_predicate}]]//{target_type}[{target_predicate}]"
            );

            /*
             * SAFE candidate.
             *
             * Keeps the stronger local cardinality boundary
             * and remains available when the compact form is
             * not unique.
             */
            let safe = format!(
                "{anchor_selector}/ancestor::{component_type}[count(.//{target_type}[{target_predicate}])=1]//{target_type}[{target_predicate}]"
            );

            let safe_template = format!(
                "//{anchor_type}[@{anchor_attribute}=${{{parameter_name}}}]/ancestor::{component_type}[count(.//{target_type}[{target_predicate}])=1]//{target_type}[{target_predicate}]"
            );

            let compact_score = 84u8.saturating_sub((depth as u8) * 3);

            let safe_score = 82u8.saturating_sub((depth as u8) * 3);

            /*
             * Compact goes first so the live validation gate
             * evaluates the maintainable form first.
             */
            result.push(Candidate {
                strategy: "xpath",
                value: compact,
                score: compact_score,
                reason: "Compact semantic item locator within the nearest typed component",
                category: "relational-local-context-compact",
                template: Some(compact_template),
                parameter_name: Some(parameter_name.to_string()),
                parameter_example: Some(anchor_value.to_string()),
            });

            result.push(Candidate {
                strategy: "xpath",
                value: safe,
                score: safe_score,
                reason: "Cardinality-safe semantic item locator within the nearest typed component",
                category: "relational-local-context",
                template: Some(safe_template),
                parameter_name: Some(parameter_name.to_string()),
                parameter_example: Some(anchor_value.to_string()),
            });

            /*
             * Generate the best anchor for this component.
             * Appium validation remains authoritative.
             */
            break;
        }

        ancestor_id = component.parent_id.clone();
    }

    result
}

fn contextual_android_candidates_v4(
    session_id: &str,
    target: &crate::models::spy::MobileElementSnapshot,
    snapshot: &[crate::models::spy::MobileElementSnapshot],
    context: &mut LocatorAnalysisContext,
) -> Vec<Candidate> {
    let mut result = Vec::new();

    let Some(target_predicate) = contextual_target_predicate_v4(target) else {
        return result;
    };

    let target_type = xpath_type(&target.element_type).unwrap_or("*");

    /*
     * Prefer semantically meaningful descendants of
     * target ancestors. This naturally scopes analysis
     * to the local component instead of the whole page.
     */
    for ancestor in ancestor_chain(target, snapshot) {
        if !context.can_request() {
            break;
        }

        let mut anchors = snapshot
            .iter()
            .filter(|candidate| {
                candidate.id != target.id
                    && is_descendant_of(candidate, &ancestor.id, snapshot)
                    && contextual_semantic_value(candidate).is_some()
            })
            .collect::<Vec<_>>();

        /*
         * Prefer nearby nodes in the hierarchy.
         * Deterministic ordering, no app-specific data.
         */
        anchors.sort_by_key(|candidate| candidate.index.abs_diff(target.index));

        anchors.truncate(8);

        for anchor in anchors {
            if !same_local_component(target, anchor, snapshot) {
                continue;
            }

            if !context.can_request() {
                break;
            }

            let Some((anchor_selector, anchor_attribute, anchor_example)) =
                semantic_anchor_xpath(anchor)
            else {
                continue;
            };

            /*
             * Anchor itself must be globally unique.
             */
            let Ok(anchor_matches) = context.match_count(session_id, "xpath", &anchor_selector)
            else {
                continue;
            };

            if anchor_matches != 1 {
                continue;
            }

            /*
             * Anchor → nearest shared component → target.
             *
             * ancestor::* is constrained by component type
             * and by the target predicate.
             *
             * No [1], [2], etc.
             */
            let concrete = format!(
                "{anchor_selector}/ancestor::*[count(.//{target_type}[{target_predicate}])=1]//{target_type}[{target_predicate}]"
            );

            /*
             * Build reusable template from the SAME
             * relationship. Validation is performed on
             * concrete selector only.
             */
            let anchor_type = xpath_type(&anchor.element_type).unwrap_or("*");

            let template = format!(
                "//{anchor_type}[@{anchor_attribute}=${{anchorValue}}]/ancestor::*[count(.//{target_type}[{target_predicate}])=1]//{target_type}[{target_predicate}]"
            );

            let template = if target.element_type.to_ascii_lowercase().contains("image") {
                template.replace("${anchorValue}", "${itemName}")
            } else {
                template
            };

            result.push(Candidate {
                strategy: "xpath",
                value: concrete,
                score: 78,
                reason: "Verified unique semantic anchor within nearest shared component",
                category: "relational-parameterized",
                template: Some(template),
                parameter_name: Some(
                    if target.element_type.to_ascii_lowercase().contains("image") {
                        "itemName".to_string()
                    } else {
                        "anchorValue".to_string()
                    },
                ),
                parameter_example: Some(anchor_example),
            });

            /*
             * One strong semantic relationship is enough
             * for this component. validate() remains the
             * final MATCH-1 gate.
             */
            return result;
        }
    }

    result
}

fn semantic_descendant_candidates(
    target: &crate::models::spy::MobileElementSnapshot,
    elements: &[crate::models::spy::MobileElementSnapshot],
) -> Vec<Candidate> {
    let mut descendants = elements
        .iter()
        .filter(|candidate| {
            candidate.id != target.id && is_descendant_of(candidate, &target.id, elements)
        })
        .collect::<Vec<_>>();

    descendants.sort_by_key(|candidate| candidate.index.abs_diff(target.index));

    let mut result = Vec::new();

    for candidate in descendants {
        if result.len() >= 6 {
            break;
        }

        if let Some(value) = candidate
            .accessibility_id
            .as_deref()
            .filter(|value| meaningful(value) && !looks_dynamic(value))
        {
            result.push(Candidate {
                strategy: "accessibility-id",
                value: value.to_string(),
                score: 92,
                reason: "Verified semantic descendant of selected component",
                category: "semantic-descendant",
                template: None,
                parameter_name: None,
                parameter_example: None,
            });
        }

        if let Some(value) = candidate
            .resource_id
            .as_deref()
            .filter(|value| meaningful(value) && !looks_dynamic(value))
        {
            result.push(Candidate {
                strategy: "id",
                value: value.to_string(),
                score: 90,
                reason: "Verified resource identifier inside selected component",
                category: "semantic-descendant",
                template: None,
                parameter_name: None,
                parameter_example: None,
            });
        }

        if let Some(value) = candidate
            .text
            .as_deref()
            .filter(|value| meaningful(value) && !looks_dynamic(value))
        {
            result.push(Candidate {
                strategy: "android-uiautomator",
                value: format!("new UiSelector().text({:?})", value,),
                score: 82,
                reason: "Verified visible semantic descendant of selected component",
                category: "semantic-descendant",
                template: None,
                parameter_name: None,
                parameter_example: None,
            });
        }
    }

    result
}

pub fn analyze_android_element(
    session_id: &str,
    element_id: &str,
    elements: &[crate::models::spy::MobileElementSnapshot],
) -> Result<Vec<LocatorCandidate>, String> {
    let target = elements
        .iter()
        .find(|element| element.id == element_id)
        .ok_or_else(|| format!("Inspector element not found: {element_id}"))?;

    let mut context = LocatorAnalysisContext::new();

    crate::services::log_service::info(
        "locator",
        format!(
            "LOCATOR TARGET: id={} type={} text={:?} resource_id={:?} accessibility={:?} parent={:?}",
            target.id,
            target.element_type,
            target.text,
            target.resource_id,
            target.accessibility_id,
            target.parent_id,
        ),
    );

    crate::services::log_service::info(
        "locator",
        format!(
            "On-demand locator analysis started: {} ({})",
            target.id, target.element_type,
        ),
    );

    /*
     * -----------------------------------------------------
     * 1. DIRECT / NATIVE
     * -----------------------------------------------------
     *
     * These candidates are cheap and generally the most
     * stable. Every returned candidate has already passed
     * the MATCH == 1 gate.
     */
    let mut verified = android_candidates(
        session_id,
        &mut context,
        target.text.as_deref(),
        target.resource_id.as_deref(),
        target.accessibility_id.as_deref(),
    );

    /*
     * A selected container may have no own semantic
     * attributes even though its actionable child does.
     */
    if verified.is_empty() && context.can_request() {
        let descendant_candidates = semantic_descendant_candidates(target, elements);

        let descendant_verified = validate(session_id, descendant_candidates, &mut context);

        merge_verified(&mut verified, descendant_verified);
    }

    /*
     * -----------------------------------------------------
     * 2. LOCAL SEMANTIC CONTEXT
     * -----------------------------------------------------
     *
     * Prefer component-local semantic identity before
     * spending the request budget on broader structural
     * parent/sibling/ancestor relationships.
     *
     * This is especially important for repeated native
     * attributes where text/resource/accessibility identify
     * the role but not the concrete business item.
     */
    let mut local_context_attempted = false;

    if verified.len() < MAX_CANDIDATES && context.can_request() {
        local_context_attempted = true;

        let mut local_candidates = local_semantic_context_candidates(target, elements);

        local_candidates.truncate(MAX_SYNC_RELATIONAL_CANDIDATES);

        let local_candidate_count = local_candidates.len();

        let local_verified = validate(session_id, local_candidates, &mut context);

        crate::services::log_service::info(
            "locator",
            format!(
                "Early local semantic context for {}: {} candidates generated, {} verified MATCH 1",
                target.id,
                local_candidate_count,
                local_verified.len(),
            ),
        );

        merge_verified(&mut verified, local_verified);
    }

    /*
     * DIRECT FAST PATH
     *
     * Every candidate in `verified` already passed the
     * live Appium MATCH == 1 gate.
     *
     * If the selected target itself exposes a stable
     * semantic/native attribute, return those candidates
     * immediately. Relational XPath is a fallback for
     * targets that cannot identify themselves.
     *
     * This also keeps the synchronous request budget for
     * difficult elements instead of spending it after a
     * direct solution has already been proven.
     */
    if verified.len() >= MAX_CANDIDATES && !locator_needs_context(target) {
        crate::services::log_service::info(
            "locator",
            format!(
                "DIRECT LOCATOR FAST PATH: {} -> {} verified candidate(s)",
                target.id,
                verified.len(),
            ),
        );

        verified.sort_by(|left, right| right.score.cmp(&left.score));

        verified
            .dedup_by(|left, right| left.strategy == right.strategy && left.value == right.value);

        verified.truncate(MAX_CANDIDATES);

        for candidate in &mut verified {
            candidate.recommended = false;
        }

        if let Some(best) = verified.first_mut() {
            best.recommended = true;
        }

        return Ok(verified);
    }

    let Some(target_type) = xpath_type(&target.element_type) else {
        return Ok(verified);
    };

    let target_predicate = android_target_predicate(target);

    let mut relational = Vec::new();

    /*
     * -----------------------------------------------------
     * 2. PARENT -> TARGET
     * -----------------------------------------------------
     */
    if let Some(parent_id) = target.parent_id.as_deref() {
        if let Some(parent) = elements.iter().find(|element| element.id == parent_id) {
            if let (Some(parent_type), Some(parent_predicate)) = (
                xpath_type(&parent.element_type),
                android_anchor_predicate(parent),
            ) {
                let target_filter = target_predicate
                    .as_ref()
                    .map(|predicate| format!("[{predicate}]"))
                    .unwrap_or_default();

                relational.push(Candidate {
                    strategy: "xpath",
                    value: format!(
                        "//{parent_type}[{parent_predicate}]//{target_type}{target_filter}"
                    ),
                    score: 92,
                    reason: "Verified stable parent-to-descendant relationship",
                    category: "relational-parent",
                    template: None,
                    parameter_name: None,
                    parameter_example: None,
                });
            }

            /*
             * -------------------------------------------------
             * 3. DIRECT SIBLINGS
             * -------------------------------------------------
             */
            for sibling_id in &parent.children_ids {
                if sibling_id == &target.id {
                    continue;
                }

                let Some(sibling) = elements.iter().find(|element| element.id == *sibling_id)
                else {
                    continue;
                };

                let (Some(sibling_type), Some(sibling_predicate)) = (
                    xpath_type(&sibling.element_type),
                    android_anchor_predicate(sibling),
                ) else {
                    continue;
                };

                let target_filter = target_predicate
                    .as_ref()
                    .map(|predicate| format!("[{predicate}]"))
                    .unwrap_or_default();

                relational.push(Candidate {
                    strategy: "xpath",
                    value: format!(
                        "//{sibling_type}[{sibling_predicate}]/following-sibling::{target_type}{target_filter}"
                    ),
                    score: 90,
                    reason:
                        "Verified following-sibling relationship from semantic anchor",
                    category: "relational-sibling",
                    template: None,
                    parameter_name: None,
                    parameter_example: None,
                });

                relational.push(Candidate {
                    strategy: "xpath",
                    value: format!(
                        "//{sibling_type}[{sibling_predicate}]/preceding-sibling::{target_type}{target_filter}"
                    ),
                    score: 89,
                    reason:
                        "Verified preceding-sibling relationship from semantic anchor",
                    category: "relational-sibling",
                    template: None,
                    parameter_name: None,
                    parameter_example: None,
                });
            }
        }
    }

    /*
     * -----------------------------------------------------
     * 4. ANCESTORS
     * -----------------------------------------------------
     */
    let mut ancestor_id = target.parent_id.clone();

    let mut depth = 0usize;

    while let Some(current_id) = ancestor_id {
        if depth >= 5 {
            break;
        }

        let Some(ancestor) = elements.iter().find(|element| element.id == current_id) else {
            break;
        };

        if let (Some(ancestor_type), Some(ancestor_predicate)) = (
            xpath_type(&ancestor.element_type),
            android_anchor_predicate(ancestor),
        ) {
            let target_filter = target_predicate
                .as_ref()
                .map(|predicate| format!("[{predicate}]"))
                .unwrap_or_default();

            relational.push(Candidate {
                strategy: "xpath",
                value: format!(
                    "//{ancestor_type}[{ancestor_predicate}]//{target_type}{target_filter}"
                ),
                score: 88u8.saturating_sub(depth as u8),
                reason: "Verified stable ancestor-to-descendant relationship",
                category: "relational-ancestor",
                template: None,
                parameter_name: None,
                parameter_example: None,
            });
        }

        ancestor_id = ancestor.parent_id.clone();

        depth += 1;
    }

    /*
     * -----------------------------------------------------
     * 5. CONTEXTUAL SEMANTIC RESOLUTION
     * -----------------------------------------------------
     *
     * This may perform additional Appium validations, but
     * ONLY for this explicitly selected target.
     */
    /*
     * Deep contextual resolution is intentionally excluded
     * from the synchronous selection path.
     *
     * Parent/sibling/ancestor candidates above are bounded.
     * Deep semantic context will be reintroduced with an
     * explicit request budget and caching.
     */

    /*
     * Hard synchronous request budget.
     *
     * Every candidate may become an Appium
     * findElements request. The selection path
     * must therefore remain strictly bounded.
     */
    /*
     * Relational alternatives are part of the public locator
     * contract, not merely an emergency fallback.
     *
     * Keep the exploration bounded, but allow the verifier to
     * evaluate enough structural candidates to discover
     * parent, sibling and ancestor alternatives.
     *
     * The shared LocatorAnalysisContext still enforces the
     * global request/deadline budget.
     */
    relational.truncate(MAX_CANDIDATES);

    let candidate_count = relational.len();

    let relational_verified = validate(session_id, relational, &mut context);

    crate::services::log_service::info(
        "locator",
        format!(
            "On-demand relational analysis for {}: {} candidates, {} MATCH 1",
            target.id,
            candidate_count,
            relational_verified.len(),
        ),
    );

    merge_verified(&mut verified, relational_verified);

    /*
     * -----------------------------------------------------
     * CONTEXTUAL IDENTITY GATE
     * -----------------------------------------------------
     *
     * MATCH 1 is current uniqueness, not necessarily
     * business identity.
     *
     * Anonymous/repeated visual targets keep their direct
     * and simple relational locators only as fallbacks.
     * The semantic contextual resolver gets first chance
     * to identify WHICH business item owns the target.
     */
    let contextual_fallback = if locator_needs_context(target) {
        Some(std::mem::take(&mut verified))
    } else {
        None
    };

    /*
     * -----------------------------------------------------
     * 6. CONTEXTUAL SEMANTIC V2
     * -----------------------------------------------------
     *
     * Only reached when direct/local strategies were not
     * sufficient. Uses the same cache/deadline/request
     * budget as every previous validation.
     */
    crate::services::log_service::info(
        "locator",
        format!(
            "CONTEXT V2 ENTRY: verified={} requests={}/{} cache={} elapsed_ms={} can_request={}",
            verified.len(),
            context.request_count(),
            MAX_LOCATOR_REQUESTS,
            context.cache_size(),
            context.elapsed().as_millis(),
            context.can_request(),
        ),
    );

    /*
     * -----------------------------------------------------
     * 6A. LOCAL SEMANTIC CONTEXT
     * -----------------------------------------------------
     *
     * For anonymous/repeated visual targets, first try
     * the nearest semantic component:
     *
     * item label -> local component -> selected target.
     *
     * This runs before the broader V4 contextual search.
     */
    if !local_context_attempted && verified.is_empty() && context.can_request() {
        let mut local_candidates = local_semantic_context_candidates(target, elements);

        local_candidates.truncate(MAX_SYNC_RELATIONAL_CANDIDATES);

        let local_candidate_count = local_candidates.len();

        let local_verified = validate(session_id, local_candidates, &mut context);

        crate::services::log_service::info(
            "locator",
            format!(
                "Local semantic context for {}: {} candidates generated, {} verified MATCH 1",
                target.id,
                local_candidate_count,
                local_verified.len(),
            ),
        );

        merge_verified(&mut verified, local_verified);
    }

    /*
     * A verified nearest-component relationship is already
     * sufficient. Do not continue upward into broader
     * anchors that could belong to another card/menu item.
     */
    if !verified.is_empty() {
        /*
         * Local semantic context resolved the business identity,
         * so broader contextual search is intentionally skipped.
         *
         * Restore already-verified direct/native candidates as
         * safe alternatives before ranking the final result.
         * They were temporarily parked only to give semantic
         * context first chance at becoming the recommended
         * locator.
         */
        if let Some(fallback) = contextual_fallback {
            merge_verified(&mut verified, fallback);
        }

        verified.sort_by(|left, right| right.score.cmp(&left.score));

        verified
            .dedup_by(|left, right| left.strategy == right.strategy && left.value == right.value);

        verified.truncate(MAX_CANDIDATES);

        for candidate in &mut verified {
            candidate.recommended = false;
        }

        if let Some(best) = verified.first_mut() {
            best.recommended = true;
        }

        crate::services::log_service::info(
            "locator",
            format!(
                "LOCAL CONTEXT FAST PATH: {} -> {} verified locator(s)",
                target.id,
                verified.len(),
            ),
        );

        return Ok(verified);
    }

    /*
     * -----------------------------------------------------
     * 6B. BROADER CONTEXTUAL V4 FALLBACK
     * -----------------------------------------------------
     *
     * Only reached when local semantic context produced
     * no verified locator.
     */
    if verified.len() < MAX_CANDIDATES && context.can_request() {
        let mut contextual =
            contextual_android_candidates_v4(session_id, target, elements, &mut context);

        contextual.truncate(MAX_SYNC_RELATIONAL_CANDIDATES);

        let contextual_count = contextual.len();

        let contextual_verified = validate(session_id, contextual, &mut context);

        crate::services::log_service::info(
            "locator",
            format!(
                "Context V2 for {}: {} candidates generated, {} verified MATCH 1",
                target.id,
                contextual_count,
                contextual_verified.len(),
            ),
        );

        merge_verified(&mut verified, contextual_verified);
    }

    /*
     * Contextual resolution failed.
     *
     * Preserve useful direct/native alternatives rather than
     * returning nothing, but only after semantic context had
     * the opportunity to identify the business item.
     */
    if verified.is_empty() {
        if let Some(fallback) = contextual_fallback {
            merge_verified(&mut verified, fallback);
        }
    }

    crate::services::log_service::info(
        "locator",
        format!(
            "On-demand locator analysis completed: {} -> {} verified locators",
            target.id,
            verified.len(),
        ),
    );

    crate::services::log_service::info(
        "locator",
        format!(
            "On-demand analysis summary: {} · {} verified · {} requests · {} cached · {}ms",
            target.id,
            verified.len(),
            context.request_count(),
            context.cache_size(),
            context.elapsed().as_millis(),
        ),
    );

    crate::services::log_service::info(
        "locator",
        format!(
            "LOCATOR ANALYSIS SUMMARY: target={} verified={} requests={}/{} cache={} elapsed_ms={} expired={} exhausted={}",
            target.id,
            verified.len(),
            context.request_count(),
            MAX_LOCATOR_REQUESTS,
            context.cache_size(),
            context.elapsed().as_millis(),
            context.expired(),
            context.exhausted(),
        ),
    );

    Ok(verified)
}
