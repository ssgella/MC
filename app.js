// app.js

// --- Global Variables and Constants ---
const QUESTIONS_FILE = 'questions.json';
const LOCAL_STORAGE_KEY = 'anatomy_practice_performance'; // Key for storing performance data

let allQuestions = []; // Stores all questions loaded from JSON
let userPerformance = {}; // Stores performance data loaded from local storage
let sessionQuestions = []; // Questions selected for the current practice session
let currentQuestionIndex = 0; // Current question being displayed in the session
let immediateFeedbackEnabled = false; // From setup page, decides feedback behavior
let sessionAnswers = {}; // Stores user's answers and their correctness for the current session (for review)
let reviewModeActive = false; // Tracks if the user is in session review mode


// --- Helper Functions ---

/**
 * Fetches questions from the JSON file.
 * @returns {Promise<Array>} A promise that resolves with an array of questions.
 */
async function fetchQuestions() {
    try {
        const response = await fetch(QUESTIONS_FILE);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error("Error fetching questions:", error);
        return []; // Return empty array on error
    }
}

/**
 * Loads user performance data from local storage.
 * @returns {Object} The parsed performance data, or an empty object if none exists.
 */
function loadUserPerformance() {
    try {
        const data = localStorage.getItem(LOCAL_STORAGE_KEY);
        return data ? JSON.parse(data) : {};
    } catch (error) {
        console.error("Error loading user performance from local storage:", error);
        return {};
    }
}

/**
 * Saves user performance data to local storage.
 */
function saveUserPerformance() {
    try {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(userPerformance));
    } catch (error) {
        console.error("Error saving user performance to local storage:", error);
    }
}

/**
 * Get unique topics from the allQuestions array.
 * @returns {Array<string>} An array of unique topic strings.
 */
function getUniqueTopics() {
    const topics = new Set();
    allQuestions.forEach(q => topics.add(q.topic));
    return Array.from(topics).sort();
}

/**
 * Calculates the number of questions matching current filters.
 * @param {Array<Object>} questionsToFilter - The array of questions to apply filters to.
 * @param {Object} filters - Object containing current filter selections.
 * @returns {Array<Object>} An array of filtered questions.
 */
function applyFilters(questionsToFilter, filters) {
    let filtered = questionsToFilter;

    // 1. Filter by selected topics
    if (filters.selectedTopics.length > 0) {
        filtered = filtered.filter(q => filters.selectedTopics.includes(q.topic));
    }

    // 2. Filter by "only answered wrong previously"
    if (filters.onlyAnsweredWrong) {
        filtered = filtered.filter(q => {
            const perf = userPerformance[q.id];
            return perf && perf.last_answered_correctly === false;
        });
    }
    // 3. Filter by "include previously answered questions" (only if not 'only answered wrong')
    else if (!filters.includeAnswered) {
        filtered = filtered.filter(q => {
            const perf = userPerformance[q.id];
            return !perf; // Only include questions never answered before
        });
    }

    return filtered;
}

/**
 * Updates the counts next to filter options and the total available count.
 */
function updateFilterCounts() {
    const topicFiltersDiv = document.getElementById('topic-filters');
    const includeAnsweredCheckbox = document.getElementById('include-answered');
    const onlyAnsweredWrongCheckbox = document.getElementById('only-answered-wrong');
    const answeredCountSpan = document.getElementById('answered-count');
    const wrongCountSpan = document.getElementById('wrong-count');
    const totalQuestionsCountSpan = document.getElementById('total-questions-count');
    const startPracticeBtn = document.getElementById('start-practice-btn');

    // Calculate answered/wrong counts
    let answeredQuestionsCount = 0;
    let wrongAnsweredQuestionsCount = 0;
    for (const qId in userPerformance) {
        answeredQuestionsCount++;
        if (userPerformance[qId].last_answered_correctly === false) {
            wrongAnsweredQuestionsCount++;
        }
    }
    answeredCountSpan.textContent = `(${answeredQuestionsCount} questions)`;
    wrongCountSpan.textContent = `(${wrongAnsweredQuestionsCount} questions)`;

    // Get current filter selections
    const selectedTopics = Array.from(topicFiltersDiv.querySelectorAll('input[type="checkbox"]:checked'))
                                .map(cb => cb.value);
    const includeAnswered = includeAnsweredCheckbox.checked;
    const onlyAnsweredWrong = onlyAnsweredWrongCheckbox.checked;

    const currentFilters = { selectedTopics, includeAnswered, onlyAnsweredWrong };
    const availableQuestions = applyFilters(allQuestions, currentFilters);
    totalQuestionsCountSpan.textContent = availableQuestions.length;

    // Update start button state
    startPracticeBtn.disabled = availableQuestions.length === 0;
}

/**
 * Renders the overall and topic-specific performance bars on the index page.
 */
function renderPerformanceBars() {
    const overallPerformanceBarContainer = document.getElementById('overall-performance-bar');
    const overallPerformanceText = document.getElementById('overall-performance-text');
    const topicPerformanceBarsContainer = document.getElementById('topic-performance-bars');

    if (!overallPerformanceBarContainer || !topicPerformanceBarsContainer) return; // Not on the index page

    // Clear previous bars
    overallPerformanceBarContainer.innerHTML = '';
    topicPerformanceBarsContainer.innerHTML = '';

    let totalAttempted = 0;
    let totalCorrect = 0;
    let totalIncorrect = 0;
    let totalUnanswered = allQuestions.length; // Start with all questions as unanswered

    const topicStats = {}; // { 'Topic Name': { attempted: 0, correct: 0, incorrect: 0, unanswered: 0, totalQuestions: 0 } }

    allQuestions.forEach(q => {
        if (!topicStats[q.topic]) {
            topicStats[q.topic] = { attempted: 0, correct: 0, incorrect: 0, unanswered: 0, totalQuestions: 0 };
        }
        topicStats[q.topic].totalQuestions++;

        const perf = userPerformance[q.id];
        if (perf) { // If there's performance data for this question
            totalAttempted++;
            topicStats[q.topic].attempted++;
            if (perf.last_answered_correctly) {
                totalCorrect++;
                topicStats[q.topic].correct++;
            } else {
                totalIncorrect++;
                topicStats[q.topic].incorrect++;
            }
        }
    });

    // Calculate actual unanswered per topic and overall
    Object.keys(topicStats).forEach(topic => {
        topicStats[topic].unanswered = topicStats[topic].totalQuestions - topicStats[topic].attempted;
    });
    totalUnanswered = allQuestions.length - totalAttempted;


    // --- Render Overall Performance Bar ---
    // Percentages are relative to total number of questions, not just attempted
    const overallCorrectPct = allQuestions.length > 0 ? (totalCorrect / allQuestions.length) * 100 : 0;
    const overallIncorrectPct = allQuestions.length > 0 ? (totalIncorrect / allQuestions.length) * 100 : 0;
    const overallUnansweredPct = allQuestions.length > 0 ? (totalUnanswered / allQuestions.length) * 100 : 100;

    if (allQuestions.length > 0) {
        // Build segments
        const segments = [
            { className: 'correct-segment', width: overallCorrectPct },
            { className: 'incorrect-segment', width: overallIncorrectPct },
            { className: 'unanswered-segment', width: overallUnansweredPct }
        ];

        segments.forEach(segmentData => {
            if (segmentData.width > 0) {
                const segment = document.createElement('div');
                segment.className = `progress-bar-segment ${segmentData.className}`;
                segment.style.width = `${segmentData.width}%`;
                overallPerformanceBarContainer.appendChild(segment);
            }
        });

        overallPerformanceText.textContent = `Correct: ${totalCorrect} (${overallCorrectPct.toFixed(1)}%), Incorrect: ${totalIncorrect} (${overallIncorrectPct.toFixed(1)}%), Unanswered: ${totalUnanswered} (${overallUnansweredPct.toFixed(1)}%)`;
    } else {
        overallPerformanceBarContainer.innerHTML = '<p class="text-gray-500 text-center">No questions loaded to show performance.</p>';
        overallPerformanceText.textContent = '';
    }


    // --- Render Topic-specific Performance Bars ---
    if (Object.keys(topicStats).length > 0 && totalAttempted > 0) { // Only show if at least one question answered
        topicPerformanceBarsContainer.innerHTML = ''; // Clear "Answer some questions" message
        Object.keys(topicStats).sort().forEach(topic => {
            const stats = topicStats[topic];
            if (stats.totalQuestions === 0) return; // Skip topics with no questions

            const topicDiv = document.createElement('div');
            topicDiv.className = 'mb-2';
            topicDiv.innerHTML = `<h4 class="text-md font-medium text-gray-600 mb-1">${topic} (${stats.totalQuestions} questions)</h4>`;

            const topicBarContainer = document.createElement('div');
            topicBarContainer.className = 'progress-bar-container';

            const topicCorrectPct = (stats.correct / stats.totalQuestions) * 100;
            const topicIncorrectPct = (stats.incorrect / stats.totalQuestions) * 100;
            const topicUnansweredPct = (stats.unanswered / stats.totalQuestions) * 100;

            const topicSegments = [
                { className: 'correct-segment', width: topicCorrectPct },
                { className: 'incorrect-segment', width: topicIncorrectPct },
                { className: 'unanswered-segment', width: topicUnansweredPct }
            ];

            topicSegments.forEach(segmentData => {
                if (segmentData.width > 0) {
                    const segment = document.createElement('div');
                    segment.className = `progress-bar-segment ${segmentData.className}`;
                    segment.style.width = `${segmentData.width}%`;
                    topicBarContainer.appendChild(segment);
                }
            });

            const topicText = document.createElement('div');
            topicText.className = 'text-xs text-gray-500 mt-1';
            topicText.textContent = `Correct: ${stats.correct} (${topicCorrectPct.toFixed(1)}%), Incorrect: ${stats.incorrect} (${topicIncorrectPct.toFixed(1)}%), Unanswered: ${stats.unanswered} (${topicUnansweredPct.toFixed(1)}%)`;

            topicDiv.appendChild(topicBarContainer);
            topicDiv.appendChild(topicText);
            topicPerformanceBarsContainer.appendChild(topicDiv);
        });
    } else {
         topicPerformanceBarsContainer.innerHTML = '<p class="text-gray-500 text-center">Answer some questions to see performance by topic.</p>';
    }
}


// --- Practice Session Page Logic ---

/**
 * Displays the current question in the practice session.
 */
function displayQuestion() {
    console.log("displayQuestion called. Current index:", currentQuestionIndex); // Debugging

    const question = sessionQuestions[currentQuestionIndex];
    if (!question) {
        console.error("No question to display at current index:", currentQuestionIndex);
        return;
    }

    const questionTextElement = document.getElementById('question-text');
    const optionsContainer = document.getElementById('options-container');
    const currentQuestionNumSpan = document.getElementById('current-question-num');
    const totalSessionQuestionsSpan = document.getElementById('total-session-questions');
    const feedbackArea = document.getElementById('feedback-area');
    // Removed submitBtn as it's no longer used or is hidden
    const nextBtn = document.getElementById('next-question-btn');
    const prevBtn = document.getElementById('prev-question-btn');


    currentQuestionNumSpan.textContent = currentQuestionIndex + 1;
    totalSessionQuestionsSpan.textContent = sessionQuestions.length;
    questionTextElement.textContent = question.question;
    optionsContainer.innerHTML = ''; // Clear previous options
    feedbackArea.innerHTML = ''; // Clear feedback content
    feedbackArea.classList.add('hidden'); // Hide feedback area by default
    feedbackArea.classList.remove('feedback-correct', 'feedback-incorrect', 'bg-yellow-100', 'text-yellow-800'); // Clean feedback styling


    nextBtn.textContent = 'Next'; // Reset button text for regular flow

    // Determine if question is already answered in THIS session
    const sessionAnswer = sessionAnswers[question.id];
    const isQuestionAnsweredInSession = sessionAnswer && sessionAnswer.answered;

    // --- Render Options ---
    question.options.forEach((option, index) => {
        const optionLabel = document.createElement('label');
        // Base class, add hover/pointer only if not answered yet or in review mode
        optionLabel.className = `option-label flex items-center bg-white border border-gray-300 rounded-md p-4 mb-2 ${isQuestionAnsweredInSession && !reviewModeActive ? 'cursor-default' : 'hover:bg-gray-50 cursor-pointer'}`; // Adjusted cursor for non-immediate
        optionLabel.innerHTML = `
            <input type="radio" name="answer" value="${index}" class="option-input h-5 w-5 text-blue-600 mr-3">
            <span class="text-gray-800">${option}</span>
        `;
        optionsContainer.appendChild(optionLabel);

        const radioInput = optionLabel.querySelector('input');

        // Restore selected state if answered in session
        if (isQuestionAnsweredInSession && sessionAnswer.userAnswerIndex === index) {
            radioInput.checked = true;
            if (!immediateFeedbackEnabled && !reviewModeActive) {
                // Add 'selected' class for visual memory in non-immediate, non-review mode
                optionLabel.classList.add('selected');
            }
        }

        // Attach event listener for submission logic ONLY if not in review mode
        if (!reviewModeActive) {
            radioInput.addEventListener('change', handleSubmitAnswer);
            // Options are disabled if immediate feedback is enabled AND question is answered
            // Otherwise, they remain enabled (for non-immediate mode, allowing changes until 'Next' or 'End')
            if (isQuestionAnsweredInSession && immediateFeedbackEnabled) {
                radioInput.disabled = true;
                optionLabel.classList.remove('hover:bg-gray-50', 'cursor-pointer');
                optionLabel.classList.add('cursor-default');
            } else {
                radioInput.disabled = false; // By default enabled
            }
        } else {
            // In review mode, always disable inputs
            radioInput.disabled = true;
            optionLabel.classList.remove('hover:bg-gray-50', 'cursor-pointer');
            optionLabel.classList.add('cursor-default');
        }
    });

    // Control Feedback Area visibility if question already answered
    if (isQuestionAnsweredInSession) {
        if (immediateFeedbackEnabled || reviewModeActive) {
            showFeedbackAndHighlight(question, sessionAnswer.userAnswerIndex, sessionAnswer.isCorrect);
        } else {
            feedbackArea.classList.add('hidden');
        }
    } else {
        // Clear previous selected visual state if not answered
        enableOptions(); // This will clear previous selection and enable
    }

    updateNavigationButtons();
    updateSidebarSelection();
}

/**
 * Handles the submission of an answer for the current question.
 * This function is called by radio button change event.
 */
function handleSubmitAnswer() {
    const question = sessionQuestions[currentQuestionIndex];
    const selectedOption = document.querySelector('input[name="answer"]:checked');
    const feedbackArea = document.getElementById('feedback-area');

    if (!selectedOption) {
        // This case should ideally not happen if triggered by change event
        feedbackArea.className = 'mt-6 p-4 rounded-md bg-yellow-100 text-yellow-800';
        feedbackArea.innerHTML = '<p class="font-semibold">Please select an answer before submitting.</p>';
        feedbackArea.classList.remove('hidden');
        return;
    }

    const userAnswerIndex = parseInt(selectedOption.value);
    const isCorrect = userAnswerIndex === question.correct_answer_index;

    // If already answered in this session, just update visual state, don't re-process performance
    if (sessionAnswers[question.id] && sessionAnswers[question.id].answered) {
         // Update visual selected state if user changes mind
        document.querySelectorAll('.option-label').forEach(label => label.classList.remove('selected'));
        selectedOption.closest('label').classList.add('selected');
        // If immediate feedback is ON, re-show feedback
        if (immediateFeedbackEnabled) {
             showFeedbackAndHighlight(question, userAnswerIndex, isCorrect);
        }
        updateNavigationButtons();
        updateSidebarSelection();
        return;
    }

    // Store answer for current session review and performance update
    sessionAnswers[question.id] = {
        userAnswerIndex: userAnswerIndex,
        isCorrect: isCorrect,
        answered: true // Mark as attempted in this session
    };

    // Update user performance in local storage
    updateUserPerformance(question.id, isCorrect);
    saveUserPerformance(); // Save immediately after each question

    // In immediate feedback mode, disable options and show feedback
    if (immediateFeedbackEnabled) {
        disableOptions(); // Disable all options after submission
        showFeedbackAndHighlight(question, userAnswerIndex, isCorrect); // Show feedback and highlight options
    } else {
        // In non-immediate mode, options remain enabled for user to change their mind
        // Just visually mark the selection for memory
        document.querySelectorAll('.option-label').forEach(label => label.classList.remove('selected'));
        selectedOption.closest('label').classList.add('selected');
        feedbackArea.classList.add('hidden'); // Ensure feedback area is hidden
    }

    // Update navigation buttons and sidebar regardless of mode
    updateNavigationButtons();
    updateSidebarSelection();
}

/**
 * Displays feedback (correct/incorrect) in the UI and highlights options.
 * @param {Object} question - The current question object.
 * @param {number} userAnswerIndex - The index of the user's selected answer.
 * @param {boolean} isCorrect - True if the answer was correct, false otherwise.
 */
function showFeedbackAndHighlight(question, userAnswerIndex, isCorrect) {
    const feedbackArea = document.getElementById('feedback-area');
    const options = document.querySelectorAll('.option-label');

    feedbackArea.innerHTML = ''; // Clear previous content
    feedbackArea.classList.remove('hidden', 'feedback-correct', 'feedback-incorrect', 'bg-yellow-100', 'text-yellow-800'); // Reset styling

    // Set feedback text and background
    if (isCorrect) {
        feedbackArea.classList.add('feedback-correct');
        feedbackArea.innerHTML = '<p class="font-bold text-lg">Correct!</p>';
    } else {
        feedbackArea.classList.add('feedback-incorrect');
        feedbackArea.innerHTML = '<p class="font-bold text-lg">Incorrect.</p>';
    }

    options.forEach((label, index) => {
        label.classList.remove('selected', 'correct-answer', 'incorrect-selected'); // Clean up any previous states

        // Mark user's selected answer
        if (index === userAnswerIndex) {
            if (isCorrect) {
                label.classList.add('correct-answer');
            } else {
                label.classList.add('incorrect-selected');
            }
        }
        // Always mark the correct answer
        if (index === question.correct_answer_index) {
            // Only add correct-answer if it's not already marked as incorrect-selected by user
            if (!label.classList.contains('incorrect-selected')) {
                label.classList.add('correct-answer');
            }
        }
        label.querySelector('input').disabled = true; // Disable all inputs after feedback
    });

    // Display explanation
    if (question.explanation) {
        const explanationParagraph = document.createElement('p');
        explanationParagraph.className = 'mt-3 text-sm text-gray-700'; // Make explanation readable
        explanationParagraph.textContent = question.explanation;
        feedbackArea.appendChild(explanationParagraph);
    }
    feedbackArea.classList.remove('hidden');
}

/**
 * Disables all radio button options.
 */
function disableOptions() {
    const options = document.querySelectorAll('input[name="answer"]');
    options.forEach(option => option.disabled = true);
    document.querySelectorAll('.option-label').forEach(label => label.classList.add('cursor-default'));
}

/**
 * Enables all radio button options and clears their visual state.
 */
function enableOptions() {
    const options = document.querySelectorAll('input[name="answer"]');
    options.forEach(option => {
        option.disabled = false;
        option.checked = false; // Uncheck all options when enabling
    });
    document.querySelectorAll('.option-label').forEach(label => {
        label.classList.remove('selected', 'correct-answer', 'incorrect-selected', 'cursor-default');
        // Restore hover and cursor for interactable options
        if (!reviewModeActive) { // Only add if not in review mode
            label.classList.add('hover:bg-gray-50', 'cursor-pointer');
        }
    });
}


/**
 * Updates the user performance object for a given question.
 * @param {string} questionId - The ID of the question.
 * @param {boolean} isCorrect - True if the last attempt was correct, false otherwise.
 */
function updateUserPerformance(questionId, isCorrect) {
    if (!userPerformance[questionId]) {
        userPerformance[questionId] = {
            attempts: 0,
            correct: 0,
            last_answered_correctly: false,
            history: []
        };
    }
    userPerformance[questionId].attempts++;
    if (isCorrect) {
        userPerformance[questionId].correct++;
    }
    userPerformance[questionId].last_answered_correctly = isCorrect;
    userPerformance[questionId].history.push({
        timestamp: Date.now(),
        answered_correctly: isCorrect
    });
}

/**
 * Moves to the next question or ends the session if all questions are answered.
 */
function moveToNextQuestion() {
    console.log("moveToNextQuestion called. Current index before increment:", currentQuestionIndex); // Debugging

    // Check if it's the end session button action
    const nextBtn = document.getElementById('next-question-btn');
    if (nextBtn.textContent === 'End Session') {
        showSessionSummary();
        return;
    }

    // Only advance if not the last question
    if (currentQuestionIndex < sessionQuestions.length - 1) {
        currentQuestionIndex++;
        displayQuestion();
    } else {
        // If it is the last question and not 'End Session' text, still show summary
        showSessionSummary();
    }
    updateNavigationButtons();
    updateSidebarSelection();
    console.log("moveToNextQuestion finished. Current index after increment:", currentQuestionIndex); // Debugging
}

/**
 * Moves to the previous question.
 */
function moveToPreviousQuestion() {
    console.log("moveToPreviousQuestion called. Current index before decrement:", currentQuestionIndex); // Debugging
    if (currentQuestionIndex > 0) {
        currentQuestionIndex--;
        displayQuestion();
    }
    updateNavigationButtons();
    updateSidebarSelection();
    console.log("moveToPreviousQuestion finished. Current index after decrement:", currentQuestionIndex); // Debugging
}

/**
 * Updates the state of the Previous and Next navigation buttons.
 */
function updateNavigationButtons() {
    const prevBtn = document.getElementById('prev-question-btn');
    const nextBtn = document.getElementById('next-question-btn');
    // Removed submitBtn as it's always hidden in immediate mode and not functional in non-immediate
    const endSessionBtn = document.getElementById('end-session-btn');


    prevBtn.disabled = currentQuestionIndex === 0;

    const currentQuestionAnswered = sessionAnswers[sessionQuestions[currentQuestionIndex]?.id]?.answered;
    const isLastQuestion = currentQuestionIndex === sessionQuestions.length - 1;

    if (reviewModeActive) {
        // In review mode, hide submit and end session buttons
        // submitBtn.classList.add('hidden'); // submitBtn already removed
        endSessionBtn.classList.add('hidden');
        nextBtn.textContent = 'Next Question (Review)';
        prevBtn.textContent = 'Previous Question (Review)';
        nextBtn.disabled = currentQuestionIndex === sessionQuestions.length - 1;
        prevBtn.disabled = currentQuestionIndex === 0;
        // Event listeners are set globally on init, no need to reassign onclick
    } else {
        // Regular practice mode
        // submitBtn.classList.add('hidden'); // Submit button is effectively removed/hidden

        if (immediateFeedbackEnabled) {
            nextBtn.classList.remove('hidden'); // Ensure next is visible
            endSessionBtn.classList.add('hidden'); // Ensure end session is hidden
            nextBtn.disabled = !currentQuestionAnswered && !isLastQuestion; // Enable next only if answered or not last
            if (isLastQuestion && currentQuestionAnswered) {
                nextBtn.textContent = 'End Session';
            } else {
                nextBtn.textContent = 'Next Question';
            }
        } else {
            // In results-at-end mode (non-immediate)
            // submitBtn.classList.add('hidden'); // Submit button is effectively removed/hidden
            nextBtn.classList.remove('hidden'); // Ensure next is visible
            endSessionBtn.classList.add('hidden'); // Ensure end session is hidden
            prevBtn.classList.remove('hidden'); // Ensure prev is visible

            if (isLastQuestion) {
                nextBtn.textContent = 'End Session';
            } else {
                nextBtn.textContent = 'Next';
            }
            nextBtn.disabled = false; // Always enable next button in non-immediate mode
        }
    }
}


/**
 * Populates the sidebar with question numbers and updates their status.
 */
function populateSidebar() {
    const questionListDiv = document.getElementById('question-list');
    questionListDiv.innerHTML = ''; // Clear existing list

    sessionQuestions.forEach((question, index) => {
        const item = document.createElement('div');
        item.textContent = `Question ${index + 1}`;
        item.className = 'question-nav-item';
        item.dataset.index = index; // Store index for navigation

        // Add event listener for navigation
        item.addEventListener('click', () => {
            currentQuestionIndex = index;
            displayQuestion(); // displayQuestion handles all state restoration
            updateNavigationButtons();
            updateSidebarSelection();
        });
        questionListDiv.appendChild(item);
    });
    updateSidebarSelection();
}

/**
 * Updates the visual state of sidebar items (gray/white).
 */
function updateSidebarSelection() {
    const items = document.querySelectorAll('.question-nav-item');
    items.forEach((item, index) => {
        item.classList.remove('current', 'answered');

        if (index === currentQuestionIndex) {
            item.classList.add('current');
        }

        const questionId = sessionQuestions[index]?.id;
        if (questionId && sessionAnswers[questionId] && sessionAnswers[questionId].answered) {
            item.classList.add('answered'); // Mark as white (answered)
        } else {
            // Revert to default gray if not answered (e.g., if re-populating)
            item.classList.remove('answered');
        }
    });
}

/**
 * Shows the end-of-session summary modal.
 */
function showSessionSummary() {
    reviewModeActive = false; // Ensure review mode is off when showing summary initially
    const correctCount = Object.values(sessionAnswers).filter(a => a.isCorrect).length;
    const totalQuestions = sessionQuestions.length;
    const finalScoreSpan = document.getElementById('final-score');
    const summaryModal = document.getElementById('summary-modal');

    finalScoreSpan.textContent = `${correctCount} out of ${totalQuestions}`;
    summaryModal.classList.remove('hidden');

    // Bind event listeners for modal buttons
    document.getElementById('review-session-btn').onclick = startReviewMode;
    // Updated button to consistently go back to index
    document.getElementById('start-new-session-modal-btn').onclick = () => window.location.href = 'index.html';
    document.getElementById('start-new-session-modal-btn').textContent = 'Back to Setup / Start New Session';
}

/**
 * Starts the review mode after a session.
 */
function startReviewMode() {
    reviewModeActive = true;
    document.getElementById('summary-modal').classList.add('hidden');
    currentQuestionIndex = 0; // Start review from the first question
    displayQuestion(); // Use general displayQuestion, which will show answered state
    updateNavigationButtons(); // Update navigation for review mode
    updateSidebarSelection(); // Update sidebar for review mode (all will be 'answered')
}

// --- Confirmation Modal Functions ---
function showConfirmModal() {
    document.getElementById('confirm-modal').classList.remove('hidden');
}

function hideConfirmModal() {
    document.getElementById('confirm-modal').classList.add('hidden');
}


// --- Initialization Logic ---

// Function to run on `index.html` (setup page) load
async function initializeSetupPage() {
    if (window.location.pathname.endsWith('index.html') || window.location.pathname === '/') {
        allQuestions = await fetchQuestions();
        userPerformance = loadUserPerformance();

        const topicFiltersDiv = document.getElementById('topic-filters');
        topicFiltersDiv.innerHTML = ''; // Clear loading message

        const uniqueTopics = getUniqueTopics();
        if (uniqueTopics.length === 0 && allQuestions.length > 0) {
             topicFiltersDiv.innerHTML = '<p class="text-gray-500">No topics found in questions. All questions will be included by default.</p>';
        } else if (uniqueTopics.length === 0) {
             topicFiltersDiv.innerHTML = '<p class="text-red-500">No questions loaded. Please check questions.json.</p>';
        }

        uniqueTopics.forEach(topic => {
            const checkboxContainer = document.createElement('label');
            checkboxContainer.className = 'flex items-center text-gray-800 cursor-pointer';
            checkboxContainer.innerHTML = `
                <input type="checkbox" value="${topic}" class="form-checkbox h-4 w-4 text-blue-600 rounded focus:ring-blue-500 topic-filter-checkbox" checked>
                <span class="ml-2">${topic} (${allQuestions.filter(q => q.topic === topic).length})</span>
            `;
            topicFiltersDiv.appendChild(checkboxContainer);
        });

        // Add event listeners for filters to update counts
        document.getElementById('num-questions').addEventListener('change', updateFilterCounts);
        document.getElementById('topic-filters').addEventListener('change', (e) => {
            if (e.target.classList.contains('topic-filter-checkbox')) {
                updateFilterCounts();
            }
        });
        document.getElementById('include-answered').addEventListener('change', updateFilterCounts);
        document.getElementById('only-answered-wrong').addEventListener('change', () => {
            // If "only answered wrong" is checked, uncheck "include answered" (logically implied)
            if (document.getElementById('only-answered-wrong').checked) {
                document.getElementById('include-answered').checked = true;
            }
            updateFilterCounts();
        });

        updateFilterCounts(); // Initial update of counts
        renderPerformanceBars(); // Render performance bars on initial load of setup page

        // Start Practice Button Logic
        document.getElementById('start-practice-btn').addEventListener('click', () => {
            const numQuestions = document.getElementById('num-questions').value;
            const selectedTopics = Array.from(topicFiltersDiv.querySelectorAll('input[type="checkbox"]:checked'))
                                       .map(cb => cb.value);
            const includeAnswered = document.getElementById('include-answered').checked;
            const onlyAnsweredWrong = document.getElementById('only-answered-wrong').checked;
            immediateFeedbackEnabled = document.getElementById('immediate-feedback').checked; // Store this setting

            const filters = { selectedTopics, includeAnswered, onlyAnsweredWrong };
            let questionsForSession = applyFilters(allQuestions, filters);

            // Shuffle questions
            questionsForSession.sort(() => Math.random() - 0.5);

            // Limit by number of questions
            if (numQuestions !== 'all') {
                questionsForSession = questionsForSession.slice(0, parseInt(numQuestions));
            }

            if (questionsForSession.length > 0) {
                sessionStorage.setItem('sessionQuestions', JSON.stringify(questionsForSession));
                sessionStorage.setItem('immediateFeedbackEnabled', JSON.stringify(immediateFeedbackEnabled));
                window.location.href = 'practice.html'; // Redirect to practice page
            } else {
                // This should be handled by disabling the button, but as a fallback
                console.warn("Attempted to start session with 0 questions. Button should have been disabled.");
            }
        });
    }
}

// Function to run on `practice.html` (session page) load
function initializePracticePage() {
    if (window.location.pathname.endsWith('practice.html')) {
        const storedQuestions = sessionStorage.getItem('sessionQuestions');
        const storedFeedbackSetting = sessionStorage.getItem('immediateFeedbackEnabled');

        if (!storedQuestions) {
            console.error("No session questions found. Redirecting to setup.");
            window.location.href = 'index.html';
            return;
        }

        sessionQuestions = JSON.parse(storedQuestions);
        immediateFeedbackEnabled = JSON.parse(storedFeedbackSetting);
        userPerformance = loadUserPerformance(); // Load performance for updating

        currentQuestionIndex = 0;
        sessionAnswers = {}; // Reset answers for the new session (important for fresh session)
        reviewModeActive = false; // Ensure review mode is off at start of new session

        populateSidebar();
        displayQuestion();

        // Attach event listeners for practice page buttons
        document.getElementById('next-question-btn').addEventListener('click', moveToNextQuestion);
        document.getElementById('prev-question-btn').addEventListener('click', moveToPreviousQuestion);
        document.getElementById('end-session-btn').addEventListener('click', showSessionSummary);

        // Back to Setup button logic
        document.getElementById('back-to-setup-btn').addEventListener('click', showConfirmModal);
        document.getElementById('confirm-yes-btn').addEventListener('click', () => {
            window.location.href = 'index.html';
        });
        document.getElementById('confirm-no-btn').addEventListener('click', hideConfirmModal);
    }
}

// Determine which initialization function to call based on the current page
document.addEventListener('DOMContentLoaded', () => {
    if (window.location.pathname.endsWith('index.html') || window.location.pathname === '/') {
        initializeSetupPage();
    } else if (window.location.pathname.endsWith('practice.html')) {
        initializePracticePage();
    }
});
